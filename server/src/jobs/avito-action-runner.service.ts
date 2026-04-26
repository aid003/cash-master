import { Injectable } from '@nestjs/common';
import puppeteer, { type Browser, type Page } from 'puppeteer';

import type {
  ActionExecutionContext,
  AvitoActionRunner,
  RunnerExecutionResult,
} from './profile-actions.types';

@Injectable()
export class AvitoActionRunnerService implements AvitoActionRunner {
  private static readonly AVITO_WITHDRAW_URL = 'https://www.avito.ru/tariff/cpa/profile';
  private static readonly TIMEOUT_MS = 20_000;

  async executeWithdraw(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    const websocketLink = context.runtimeSnapshot.websocketLink;
    if (!websocketLink) {
      return {
        outcomeCode: 'WITHDRAW_WEBSOCKET_MISSING',
        message: 'Profile websocket link is missing, cannot connect to browser.',
        runnerMode: 'undetectable',
        rawResult: {
          action: context.action.action,
          jobId: context.job.id,
          jobItemId: context.jobItem.id,
          correlationId: context.correlationId,
          profileId: context.profile.profileId,
          currentStatus: context.runtimeSnapshot.status,
        },
      };
    }

    let browser: Browser | null = null;
    try {
      browser = await puppeteer.connect({
        browserWSEndpoint: websocketLink,
        defaultViewport: null,
      });

      const page = await this.resolveAvitoTariffPage(browser);
      await page.bringToFront();

      await this.openWithdrawModal(page);
      const amountMeta = await this.readWholeRublesAmount(page);
      if (!amountMeta) {
        return {
          outcomeCode: 'WITHDRAW_BALANCE_NOT_FOUND',
          message:
            'Withdraw amount is not visible in modal, cannot continue safely.',
          runnerMode: 'undetectable',
          rawResult: {
            profileId: context.profile.profileId,
            pageUrl: page.url(),
            wsConnected: true,
          },
        };
      }

      if (amountMeta.rubles <= 0) {
        return {
          outcomeCode: 'WITHDRAW_NON_POSITIVE_BALANCE',
          message: 'Available withdraw balance is zero after removing kopeks.',
          runnerMode: 'undetectable',
          rawResult: {
            profileId: context.profile.profileId,
            pageUrl: page.url(),
            rawAmountText: amountMeta.rawText,
            parsedAmount: amountMeta.parsed,
            roundedRubles: amountMeta.rubles,
          },
        };
      }

      await this.fillWithdrawAmount(page, amountMeta.rubles);
      await this.submitWithdraw(page);
      const confirmation = await this.waitForWithdrawConfirmation(page);

      if (!confirmation) {
        return {
          outcomeCode: 'WITHDRAW_CONFIRMATION_NOT_FOUND',
          message: 'Withdraw submit clicked, but success confirmation was not found.',
          runnerMode: 'undetectable',
          rawResult: {
            profileId: context.profile.profileId,
            pageUrl: page.url(),
            rawAmountText: amountMeta.rawText,
            parsedAmount: amountMeta.parsed,
            roundedRubles: amountMeta.rubles,
          },
        };
      }

      return {
        outcomeCode: 'WITHDRAW_COMPLETED',
        message: `Transferred ${amountMeta.rubles} RUB from advance to wallet.`,
        runnerMode: 'undetectable',
        rawResult: {
          profileId: context.profile.profileId,
          pageUrl: page.url(),
          rawAmountText: amountMeta.rawText,
          parsedAmount: amountMeta.parsed,
          roundedRubles: amountMeta.rubles,
          confirmationText: confirmation,
        },
      };
    } catch (error) {
      return {
        outcomeCode: 'WITHDRAW_EXECUTION_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Unknown withdraw automation error',
        runnerMode: 'undetectable',
        rawResult: {
          profileId: context.profile.profileId,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : String(error),
        },
      };
    } finally {
      if (browser) {
        await browser.disconnect();
      }
    }
  }

  async executeLaunchAds(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    const websocketLink = context.runtimeSnapshot.websocketLink;
    if (!websocketLink) {
      return {
        outcomeCode: 'LAUNCH_ADS_WEBSOCKET_MISSING',
        message: 'Profile websocket link is missing, cannot connect to browser.',
        runnerMode: 'undetectable',
        rawResult: {
          action: context.action.action,
          profileId: context.profile.profileId,
          currentStatus: context.runtimeSnapshot.status,
        },
      };
    }

    let browser: Browser | null = null;
    try {
      browser = await puppeteer.connect({
        browserWSEndpoint: websocketLink,
        defaultViewport: null,
      });

      const page = await this.resolveAvitoTopUpPage(browser);
      await page.bringToFront();

      const balance = await this.readSidebarBalance(page);
      if (!balance) {
        return {
          outcomeCode: 'LAUNCH_ADS_BALANCE_NOT_FOUND',
          message: 'Could not read balance before top up flow.',
          runnerMode: 'undetectable',
          rawResult: {
            profileId: context.profile.profileId,
            pageUrl: page.url(),
          },
        };
      }

      const amountToTopUp = Math.floor(balance.parsed) - 1;
      if (amountToTopUp <= 0) {
        return {
          outcomeCode: 'LAUNCH_ADS_AMOUNT_NON_POSITIVE',
          message: 'Top up amount is non-positive after applying balance - 1 rule.',
          runnerMode: 'undetectable',
          rawResult: {
            profileId: context.profile.profileId,
            pageUrl: page.url(),
            rawBalanceText: balance.rawText,
            parsedBalance: balance.parsed,
            amountToTopUp,
          },
        };
      }

      await page.click('[data-marker="advanceButton"]');
      await page.waitForSelector('[data-marker="amount/input"]', {
        timeout: AvitoActionRunnerService.TIMEOUT_MS,
      });
      await this.fillInputWithNumber(page, '[data-marker="amount/input"]', amountToTopUp);

      const selectedWallet = await page.evaluate(() => {
        const variants = Array.from(
          document.querySelectorAll<HTMLElement>('[data-marker="paymentVariant"]'),
        );
        const wallet = variants.find((variant) =>
          (variant.textContent ?? '').toLowerCase().includes('кошел'),
        );
        if (!wallet) {
          return false;
        }
        wallet.click();
        return true;
      });

      if (!selectedWallet) {
        return {
          outcomeCode: 'LAUNCH_ADS_PAYMENT_VARIANT_NOT_FOUND',
          message: 'Payment variant "Кошелёк" was not found.',
          runnerMode: 'undetectable',
          rawResult: {
            profileId: context.profile.profileId,
            pageUrl: page.url(),
            rawBalanceText: balance.rawText,
            parsedBalance: balance.parsed,
            amountToTopUp,
          },
        };
      }

      await page.click('[data-marker="submit-btn"]');
      await page.waitForSelector('[data-marker="payButton"]', {
        timeout: AvitoActionRunnerService.TIMEOUT_MS,
      });
      await page.click('[data-marker="payButton"]');

      const confirmationText = await this.waitForLaunchAdsConfirmation(page);
      if (!confirmationText) {
        return {
          outcomeCode: 'LAUNCH_ADS_CONFIRMATION_NOT_FOUND',
          message:
            'Top up confirmations were clicked, but success confirmation was not found.',
          runnerMode: 'undetectable',
          rawResult: {
            profileId: context.profile.profileId,
            pageUrl: page.url(),
            rawBalanceText: balance.rawText,
            parsedBalance: balance.parsed,
            amountToTopUp,
          },
        };
      }

      return {
        outcomeCode: 'LAUNCH_ADS_COMPLETED',
        message: `Transferred ${amountToTopUp} RUB from wallet to advance.`,
        runnerMode: 'undetectable',
        rawResult: {
          profileId: context.profile.profileId,
          pageUrl: page.url(),
          rawBalanceText: balance.rawText,
          parsedBalance: balance.parsed,
          amountToTopUp,
          confirmationText,
          steps: {
            clickedAdvanceButton: true,
            selectedWalletVariant: true,
            clickedSubmitBtn: true,
            clickedPayButton: true,
          },
        },
      };
    } catch (error) {
      return {
        outcomeCode: 'LAUNCH_ADS_EXECUTION_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Unknown launch ads automation error',
        runnerMode: 'undetectable',
        rawResult: {
          profileId: context.profile.profileId,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : String(error),
        },
      };
    } finally {
      if (browser) {
        await browser.disconnect();
      }
    }
  }

  async executeTopUpWallet(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    return this.buildStubResult(
      context,
      'TOP_UP_WALLET_STUB',
      `Top up wallet flow is prepared for ${context.action.action === 'top_up_wallet' ? context.action.amount : 0} RUB but browser automation is not implemented yet.`,
    );
  }

  private buildStubResult(
    context: ActionExecutionContext,
    outcomeCode: string,
    message: string,
  ): RunnerExecutionResult {
    return {
      outcomeCode,
      message,
      runnerMode: 'stub',
      rawResult: {
        stub: true,
        action: context.action.action,
        jobId: context.job.id,
        jobItemId: context.jobItem.id,
        correlationId: context.correlationId,
        profileId: context.profile.profileId,
        amount: context.action.action === 'top_up_wallet' ? context.action.amount : null,
        currency:
          context.action.action === 'top_up_wallet' ? context.action.currency : null,
      },
    };
  }

  private async resolveAvitoTariffPage(browser: Browser): Promise<Page> {
    const pages = await browser.pages();
    const existing = pages.find((page) =>
      page.url().startsWith(AvitoActionRunnerService.AVITO_WITHDRAW_URL),
    );
    if (existing) {
      await existing.waitForSelector('[data-marker="advanceMoreButton"]', {
        timeout: AvitoActionRunnerService.TIMEOUT_MS,
      });
      return existing;
    }

    const page = pages[0] ?? (await browser.newPage());
    await page.goto(AvitoActionRunnerService.AVITO_WITHDRAW_URL, {
      waitUntil: 'domcontentloaded',
      timeout: AvitoActionRunnerService.TIMEOUT_MS,
    });
    await page.waitForSelector('[data-marker="advanceMoreButton"]', {
      timeout: AvitoActionRunnerService.TIMEOUT_MS,
    });
    return page;
  }

  private async openWithdrawModal(page: Page): Promise<void> {
    await page.click('[data-marker="advanceMoreButton"]');
    const clickedOption = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find(
        (button) => button.textContent?.trim() === 'Вывести средства',
      );
      if (!target) {
        return false;
      }
      target.click();
      return true;
    });

    if (!clickedOption) {
      throw new Error('Withdraw option "Вывести средства" was not found.');
    }

    await page.waitForSelector('[data-marker="refundAmountInput/input"]', {
      timeout: AvitoActionRunnerService.TIMEOUT_MS,
    });
  }

  private async readWholeRublesAmount(page: Page): Promise<{
    rawText: string;
    parsed: number;
    rubles: number;
  } | null> {
    const rawAmountText = await page.evaluate(() => {
      const submitButton = document.querySelector(
        '[data-marker="refundAdvanceButton"]',
      );
      if (!submitButton) {
        return null;
      }

      let modalRoot: Element | null = submitButton;
      for (let hop = 0; hop < 8; hop += 1) {
        if (!modalRoot?.parentElement) {
          break;
        }
        modalRoot = modalRoot.parentElement;
      }

      const scope = modalRoot ?? document;
      const textNodes = Array.from(scope.querySelectorAll('span, p, div'));
      const amountPattern = /\d+(?:[.,]\d+)?\s*₽/;
      for (const node of textNodes) {
        const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        if (amountPattern.test(text)) {
          return text;
        }
      }
      return null;
    });

    if (!rawAmountText) {
      return null;
    }

    const parsed = this.parseRubAmount(rawAmountText);
    const rubles = Math.floor(parsed);
    return {
      rawText: rawAmountText,
      parsed,
      rubles,
    };
  }

  private parseRubAmount(value: string): number {
    const amountToken = value.match(/\d+(?:[.,]\d+)?/u)?.[0] ?? '';
    const normalized = amountToken.replace(',', '.');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Unable to parse amount from "${value}".`);
    }
    return parsed;
  }

  private async fillWithdrawAmount(page: Page, rubles: number): Promise<void> {
    const selector = '[data-marker="refundAmountInput/input"]';
    await page.waitForSelector(selector, {
      timeout: AvitoActionRunnerService.TIMEOUT_MS,
    });
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(selector, String(rubles));
  }

  private async submitWithdraw(page: Page): Promise<void> {
    await page.click('[data-marker="refundAdvanceButton"]');
  }

  private async resolveAvitoTopUpPage(browser: Browser): Promise<Page> {
    const page = await this.resolveAvitoTariffPage(browser);
    await page.waitForSelector('[data-marker="advanceButton"]', {
      timeout: AvitoActionRunnerService.TIMEOUT_MS,
    });
    return page;
  }

  private async readSidebarBalance(page: Page): Promise<{
    rawText: string;
    parsed: number;
  } | null> {
    const rawBalanceText = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h5'));
      const balanceHeading = headings.find((node) => {
        const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        return /\d+(?:[.,]\d+)?\s*₽/u.test(text);
      });
      return balanceHeading?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    });

    if (!rawBalanceText) {
      return null;
    }

    return {
      rawText: rawBalanceText,
      parsed: this.parseRubAmount(rawBalanceText),
    };
  }

  private async fillInputWithNumber(
    page: Page,
    selector: string,
    value: number,
  ): Promise<void> {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(selector, String(value));
  }

  private async waitForLaunchAdsConfirmation(page: Page): Promise<string | null> {
    try {
      await page.waitForFunction(
        () => {
          const statuses = Array.from(document.querySelectorAll('[role="status"]'));
          const hasStatus = statuses.some((node) =>
            /(успеш|зачис|пополн|запущ)/iu.test(node.textContent ?? ''),
          );
          const payButton = document.querySelector('[data-marker="payButton"]');
          return hasStatus || payButton === null;
        },
        {
          timeout: AvitoActionRunnerService.TIMEOUT_MS,
        },
      );
    } catch {
      return null;
    }

    return page.evaluate(() => {
      const statuses = Array.from(document.querySelectorAll('[role="status"]'));
      const status = statuses.find((node) =>
        /(успеш|зачис|пополн|запущ)/iu.test(node.textContent ?? ''),
      );
      if (status) {
        return status.textContent?.replace(/\s+/g, ' ').trim() ?? null;
      }

      return 'Pay confirmation step completed';
    });
  }

  private async waitForWithdrawConfirmation(page: Page): Promise<string | null> {
    try {
      await page.waitForFunction(
        () => {
          const statuses = Array.from(document.querySelectorAll('[role="status"]'));
          return statuses.some((node) =>
            (node.textContent ?? '').toLowerCase().includes('поступит в кошел'),
          );
        },
        { timeout: AvitoActionRunnerService.TIMEOUT_MS },
      );
    } catch {
      return null;
    }

    return page.evaluate(() => {
      const statuses = Array.from(document.querySelectorAll('[role="status"]'));
      const status = statuses.find((node) =>
        (node.textContent ?? '').toLowerCase().includes('поступит в кошел'),
      );
      return status?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    });
  }
}
