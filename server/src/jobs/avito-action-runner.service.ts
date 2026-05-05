import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { type Browser, type Page } from 'puppeteer';

import {
  ActionExecutionError,
  type ActionStep,
  type AvitoActionResult,
  type ActionExecutionContext,
  type AvitoActionRunner,
  type RunnerExecutionResult,
} from './profile-actions.types';

@Injectable()
export class AvitoActionRunnerService implements AvitoActionRunner {
  private static readonly AVITO_WITHDRAW_URL = 'https://www.avito.ru/tariff/cpa/profile';
  private static readonly TIMEOUT_MS = 20_000;
  private readonly logger = new Logger(AvitoActionRunnerService.name);

  async executeWithdraw(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    const isDisableAds = context.action.action === 'disable_ads';
    const actionLabel = isDisableAds ? 'disable ads' : 'withdraw';
    if (context.action.action !== 'disable_ads' && context.action.action !== 'withdraw') {
      throw this.createRunnerError(
        context,
        'REFUND_UNSUPPORTED_ACTION',
        `Unsupported refund action: ${context.action.action}`,
        {
          action: context.action.action,
          profileId: context.profile.profileId,
        },
      );
    }

    if (!context.runtimeSnapshot.websocketLink && !context.runtimeSnapshot.debugPort) {
      throw this.createRunnerError(
        context,
        `${this.getActionPrefix(context)}_BROWSER_ENDPOINT_MISSING`,
        'Profile browser endpoint is missing, cannot connect to browser.',
        {
          action: context.action.action,
          jobId: context.job.id,
          jobItemId: context.jobItem.id,
          correlationId: context.correlationId,
          profileId: context.profile.profileId,
          currentStatus: context.runtimeSnapshot.status,
          debugPort: context.runtimeSnapshot.debugPort,
          websocketLinkPresent: Boolean(context.runtimeSnapshot.websocketLink),
        },
      );
    }

    let browser: Browser | null = null;
    const steps: ActionStep[] = [this.createStep('avito_navigation_started', `Preparing ${actionLabel} browser flow`)];
    try {
      browser = await this.connectToProfileBrowser(context);

      const page = await this.resolveAvitoRefundPage(browser, steps);
      await page.bringToFront();
      const amountRubles = context.action.amount;

      if (!Number.isInteger(amountRubles) || amountRubles <= 0) {
        throw this.createRunnerError(
          context,
          `${this.getActionPrefix(context)}_INVALID_AMOUNT`,
          'Refund amount in rubles must be a positive integer.',
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            amountRubles,
          }),
          steps,
        );
      }

      const amountKopeks = amountRubles * 100;
      if (!Number.isSafeInteger(amountKopeks)) {
        throw this.createRunnerError(
          context,
          `${this.getActionPrefix(context)}_INVALID_AMOUNT`,
          'Refund amount in kopeks exceeds safe integer range.',
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
          }),
          steps,
        );
      }

      steps.push(
        this.createStep(
          'avito_refund_amount_converted',
          `Converted refund amount ${amountRubles} RUB to ${amountKopeks} kopeks`,
        ),
      );
      this.logger.log({
        message: 'Sending Avito advance refund request',
        action: context.action.action,
        jobId: context.job.id,
        jobItemId: context.jobItem.id,
        correlationId: context.correlationId,
        profileId: context.profile.profileId,
        amountRubles,
        amountKopeks,
      });

      const refundResponse = await this.postAdvanceRefund(page, amountKopeks);
      this.logger.log({
        message: 'Received Avito advance refund response',
        action: context.action.action,
        jobId: context.job.id,
        jobItemId: context.jobItem.id,
        correlationId: context.correlationId,
        profileId: context.profile.profileId,
        amountRubles,
        amountKopeks,
        httpStatus: refundResponse.status,
        ok: refundResponse.ok,
        responseJson: refundResponse.body,
        responseText: refundResponse.text,
      });
      steps.push(
        this.createStep(
          'avito_refund_request_completed',
          `Avito refund endpoint responded with HTTP ${refundResponse.status}`,
        ),
      );

      if (!refundResponse.ok) {
        throw this.createRunnerError(
          context,
          `${this.getActionPrefix(context)}_REFUND_HTTP_ERROR`,
          `Avito refund request failed with HTTP ${refundResponse.status}.`,
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
            requestBody: { amount: amountKopeks },
            httpStatus: refundResponse.status,
            responseJson: refundResponse.body,
            responseText: refundResponse.text,
          }),
          steps,
        );
      }

      if (!this.isSuccessfulRefundResponse(refundResponse.body)) {
        throw this.createRunnerError(
          context,
          `${this.getActionPrefix(context)}_REFUND_API_REJECTED`,
          'Avito refund endpoint did not confirm success.',
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
            requestBody: { amount: amountKopeks },
            httpStatus: refundResponse.status,
            responseJson: refundResponse.body,
            responseText: refundResponse.text,
          }),
          steps,
        );
      }

      steps.push(this.createStep('avito_dom_ready', `Avito ${actionLabel} flow confirmed`));
      return {
        outcomeCode: `${this.getActionPrefix(context)}_COMPLETED`,
        message: isDisableAds
          ? `Disable ads flow moved ${amountRubles} RUB from advance to wallet.`
          : `Transferred ${amountRubles} RUB from advance to wallet.`,
        runnerMode: 'undetectable',
        rawResult: await this.capturePageDiagnostics(page, {
          profileId: context.profile.profileId,
          amountRubles,
          amountKopeks,
          requestBody: { amount: amountKopeks },
          httpStatus: refundResponse.status,
          responseJson: refundResponse.body,
          responseText: refundResponse.text,
        }),
        steps,
      };
    } catch (error) {
      if (error instanceof ActionExecutionError) {
        throw error;
      }

      throw this.createRunnerError(
        context,
        `${this.getActionPrefix(context)}_EXECUTION_ERROR`,
        error instanceof Error ? error.message : 'Unknown withdraw automation error',
        {
          profileId: context.profile.profileId,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : String(error),
        },
        steps,
      );
    } finally {
      if (browser) {
        await browser.disconnect();
      }
    }
  }

  async executeLaunchAds(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    if (!context.runtimeSnapshot.websocketLink && !context.runtimeSnapshot.debugPort) {
      throw this.createRunnerError(
        context,
        'LAUNCH_ADS_BROWSER_ENDPOINT_MISSING',
        'Profile browser endpoint is missing, cannot connect to browser.',
        {
          action: context.action.action,
          profileId: context.profile.profileId,
          currentStatus: context.runtimeSnapshot.status,
          debugPort: context.runtimeSnapshot.debugPort,
          websocketLinkPresent: Boolean(context.runtimeSnapshot.websocketLink),
        },
      );
    }

    let browser: Browser | null = null;
    const steps: ActionStep[] = [this.createStep('avito_navigation_started', 'Preparing launch ads browser flow')];
    try {
      browser = await this.connectToProfileBrowser(context);

      const page = await this.resolveAvitoTopUpPage(browser, steps);
      await page.bringToFront();

      const balance = await this.readSidebarBalance(page);
      if (!balance) {
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_BALANCE_NOT_FOUND',
          'Could not read balance before top up flow.',
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
          }),
          steps,
        );
      }

      const amountToTopUp = Math.floor(balance.parsed) - 1;
      if (amountToTopUp <= 0) {
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_AMOUNT_NON_POSITIVE',
          'Top up amount is non-positive after applying balance - 1 rule.',
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            rawBalanceText: balance.rawText,
            parsedBalance: balance.parsed,
            amountToTopUp,
          }),
          steps,
        );
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
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_PAYMENT_VARIANT_NOT_FOUND',
          'Payment variant "Кошелёк" was not found.',
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            rawBalanceText: balance.rawText,
            parsedBalance: balance.parsed,
            amountToTopUp,
          }),
          steps,
        );
      }

      await page.click('[data-marker="submit-btn"]');
      await page.waitForSelector('[data-marker="payButton"]', {
        timeout: AvitoActionRunnerService.TIMEOUT_MS,
      });
      await page.click('[data-marker="payButton"]');

      const confirmationText = await this.waitForLaunchAdsConfirmation(page);
      if (!confirmationText) {
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_CONFIRMATION_NOT_FOUND',
          'Top up confirmations were clicked, but success confirmation was not found.',
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            rawBalanceText: balance.rawText,
            parsedBalance: balance.parsed,
            amountToTopUp,
          }),
          steps,
        );
      }

      steps.push(this.createStep('avito_dom_ready', 'Avito launch ads flow confirmed'));
      return {
        outcomeCode: 'LAUNCH_ADS_COMPLETED',
        message: `Transferred ${amountToTopUp} RUB from wallet to advance.`,
        runnerMode: 'undetectable',
        rawResult: await this.capturePageDiagnostics(page, {
          profileId: context.profile.profileId,
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
        }),
        steps,
      };
    } catch (error) {
      if (error instanceof ActionExecutionError) {
        throw error;
      }

      throw this.createRunnerError(
        context,
        'LAUNCH_ADS_EXECUTION_ERROR',
        error instanceof Error ? error.message : 'Unknown launch ads automation error',
        {
          profileId: context.profile.profileId,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : String(error),
        },
        steps,
      );
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

  private async resolveAvitoRefundPage(browser: Browser, steps?: ActionStep[]): Promise<Page> {
    const pages = await browser.pages();
    const existing = pages.find((page) =>
      page.url().startsWith(AvitoActionRunnerService.AVITO_WITHDRAW_URL),
    );
    if (existing) {
      await this.ensurePageReady(existing);
      steps?.push(
        this.createStep('avito_dom_ready', `Existing Avito page ready at ${existing.url()}`),
      );
      return existing;
    }

    const page = pages[0] ?? (await browser.newPage());
    await this.ensurePageReady(page);
    await page.goto(AvitoActionRunnerService.AVITO_WITHDRAW_URL, {
      waitUntil: 'domcontentloaded',
      timeout: AvitoActionRunnerService.TIMEOUT_MS,
    });
    await this.ensurePageReady(page);
    steps?.push(
      this.createStep('avito_dom_ready', `Avito tariff page ready at ${page.url()}`),
    );
    return page;
  }

  private async postAdvanceRefund(
    page: Page,
    amountKopeks: number,
  ): Promise<{
    ok: boolean;
    status: number;
    body: unknown;
    text: string | null;
  }> {
    return page.evaluate(async (refundAmountKopeks) => {
      const response = await fetch('/web/1/tariff/cpa/advance-refund', {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ amount: refundAmountKopeks }),
      });

      const text = await response.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }

      return {
        ok: response.ok,
        status: response.status,
        body,
        text: body === null ? text : null,
      };
    }, amountKopeks);
  }

  private isSuccessfulRefundResponse(body: unknown): boolean {
    if (!body || typeof body !== 'object') {
      return false;
    }

    const payload = body as {
      status?: unknown;
      result?: {
        success?: unknown;
      };
    };

    return payload.status === 'ok' || payload.result?.success === true;
  }

  private async resolveAvitoTariffPage(browser: Browser, steps?: ActionStep[]): Promise<Page> {
    const pages = await browser.pages();
    const existing = pages.find((page) =>
      page.url().startsWith(AvitoActionRunnerService.AVITO_WITHDRAW_URL),
    );
    if (existing) {
      await this.ensurePageReady(existing);
      await existing.waitForSelector('[data-marker="advanceMoreButton"]', {
        timeout: AvitoActionRunnerService.TIMEOUT_MS,
      });
      steps?.push(
        this.createStep('avito_dom_ready', `Existing Avito page ready at ${existing.url()}`),
      );
      return existing;
    }

    const page = pages[0] ?? (await browser.newPage());
    await this.ensurePageReady(page);
    await page.goto(AvitoActionRunnerService.AVITO_WITHDRAW_URL, {
      waitUntil: 'domcontentloaded',
      timeout: AvitoActionRunnerService.TIMEOUT_MS,
    });
    await this.ensurePageReady(page);
    await page.waitForSelector('[data-marker="advanceMoreButton"]', {
      timeout: AvitoActionRunnerService.TIMEOUT_MS,
    });
    steps?.push(
      this.createStep('avito_dom_ready', `Avito tariff page ready at ${page.url()}`),
    );
    return page;
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

  private async resolveAvitoTopUpPage(browser: Browser, steps?: ActionStep[]): Promise<Page> {
    const page = await this.resolveAvitoTariffPage(browser, steps);
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

  private async ensurePageReady(page: Page): Promise<void> {
    await page.waitForFunction(
      () => document.readyState === 'interactive' || document.readyState === 'complete',
      {
        timeout: AvitoActionRunnerService.TIMEOUT_MS,
      },
    );
  }

  private async capturePageDiagnostics(
    page: Page,
    details: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const readyState = await page.evaluate(() => document.readyState).catch(() => 'unavailable');
    return {
      ...details,
      pageUrl: page.url(),
      readyState,
    };
  }

  private createRunnerError(
    context: ActionExecutionContext,
    outcomeCode: string,
    message: string,
    rawError: unknown,
    steps?: ActionStep[],
  ) {
    const result: AvitoActionResult = {
      action: context.action.action,
      outcomeCode,
      message,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      runnerMode: 'undetectable',
      rawResult: null,
      rawError,
      steps,
    };

    return new ActionExecutionError(message, result);
  }

  private createStep(code: string, message: string): ActionStep {
    return {
      code,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  private getActionPrefix(context: ActionExecutionContext) {
    return context.action.action === 'disable_ads' ? 'DISABLE_ADS' : 'WITHDRAW';
  }

  private async connectToProfileBrowser(context: ActionExecutionContext) {
    if (context.runtimeSnapshot.debugPort) {
      this.logger.log({
        message: 'Connecting to profile browser by debug port',
        correlationId: context.correlationId,
        profileId: context.profile.profileId,
        debugPort: context.runtimeSnapshot.debugPort,
      });
      return puppeteer.connect({
        browserURL: `http://${context.runtimeSnapshot.browserHost}:${context.runtimeSnapshot.debugPort}`,
        defaultViewport: null,
      });
    }

    if (context.runtimeSnapshot.websocketLink) {
      this.logger.log({
        message: 'Connecting to profile browser by websocket link',
        correlationId: context.correlationId,
        profileId: context.profile.profileId,
        websocketLinkPresent: true,
      });
      return puppeteer.connect({
        browserWSEndpoint: context.runtimeSnapshot.websocketLink,
        defaultViewport: null,
      });
    }

    throw new Error('Profile browser endpoint is missing');
  }
}
