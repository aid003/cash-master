import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { type Browser, type Page } from 'puppeteer';

import {
  ActionExecutionError,
  type ActionExecutionContext,
  type ActionStep,
  type AvitoActionResult,
  type AvitoActionRunner,
  type RunnerExecutionResult,
  type WithdrawPayload,
} from './profile-actions.types';

type AvitoProfileInfoResponse = {
  tiles?: Array<{
    title?: unknown;
    value?: unknown;
    details?: unknown;
  }>;
};

type BrowserHttpResult = {
  ok: boolean;
  status: number;
  body: unknown;
  text: string | null;
  pageUrl: string;
};

@Injectable()
export class AvitoActionRunnerService implements AvitoActionRunner {
  private static readonly AVITO_BASE_URL = 'https://www.avito.ru/';
  private static readonly AVITO_WITHDRAW_URL = 'https://www.avito.ru/tariff/cpa/profile';
  private static readonly AVITO_ACCOUNT_STEP_URL = 'https://www.avito.ru/account/step1';
  private static readonly AVITO_ADVANCE_ACCOUNT_URL = 'https://www.avito.ru/account/advance';
  private static readonly TIMEOUT_MS = 20_000;
  private static readonly AUTO_TRANSFER_RESERVE_RUB = 1;
  private static readonly NETWORK_SOURCE = 'browser';
  private readonly logger = new Logger(AvitoActionRunnerService.name);

  async executeWithdraw(context: ActionExecutionContext): Promise<RunnerExecutionResult> {
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

    if (context.action.action === 'disable_ads') {
      return this.executeDisableAds(context);
    }

    return this.executeBrowserWithdraw(context);
  }

  async executeLaunchAds(context: ActionExecutionContext): Promise<RunnerExecutionResult> {
    return this.executeLaunchAdsBrowserFlow(context);
  }

  async executeTopUpWallet(context: ActionExecutionContext): Promise<RunnerExecutionResult> {
    return this.buildStubResult(
      context,
      'TOP_UP_WALLET_STUB',
      `Top up wallet flow is prepared for ${context.action.action === 'top_up_wallet' ? context.action.amount : 0} RUB but browser automation is not implemented yet.`,
    );
  }

  private async executeDisableAds(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    this.ensureBrowserEndpoint(context, 'DISABLE_ADS_BROWSER_ENDPOINT_MISSING');

    const steps: ActionStep[] = [
      this.createStep('refund_request_prepared', 'Preparing disable ads browser-only flow'),
    ];

    let browser: Browser | null = null;
    try {
      browser = await this.connectToProfileBrowser(context);
      const page = await this.resolveAvitoTariffPage(browser, steps);
      await page.bringToFront();

      const profileInfo = await this.fetchProfileInfoInBrowser(context, page, steps);
      const walletBalances = this.resolveBalancesFromProfileInfo(context, profileInfo.body, steps);
      const amountRubles =
        walletBalances.advanceRubles - AvitoActionRunnerService.AUTO_TRANSFER_RESERVE_RUB;
      if (!Number.isInteger(amountRubles) || amountRubles <= 0) {
        throw this.createRunnerError(
          context,
          'DISABLE_ADS_AUTO_AMOUNT_INVALID',
          'Avito advance balance is too low to disable ads after reserving 1 RUB.',
          {
            profileId: context.profile.profileId,
            advanceRubles: walletBalances.advanceRubles,
            walletRubles: walletBalances.walletRubles,
            reserveRubles: AvitoActionRunnerService.AUTO_TRANSFER_RESERVE_RUB,
            profileInfoResponse: profileInfo.body,
            networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
          },
          steps,
        );
      }

      const amountKopeks = this.convertRublesToKopeks(
        context,
        amountRubles,
        'DISABLE_ADS_INVALID_AMOUNT',
        steps,
      );
      steps.push(
        this.createStep(
          'auto_amount_calculated',
          `Detected advance ${walletBalances.advanceRubles} RUB and computed refund ${amountRubles} RUB`,
        ),
      );

      this.logBrowserRequest(context, 'Sending Avito advance refund request via browser context', {
        amountRubles,
        amountKopeks,
      });
      steps.push(
        this.createStep('refund_request_sent', 'Sending Avito advance refund request via browser'),
      );

      await this.resolveAvitoTariffPage(browser, steps);
      const refundResponse = await this.postAdvanceRefund(page, amountKopeks);
      this.logBrowserResponse(
        context,
        'Received Avito advance refund response via browser context',
        refundResponse,
        { amountRubles, amountKopeks },
      );
      steps.push(
        this.createStep(
          'refund_request_completed',
          `Avito refund endpoint responded with HTTP ${refundResponse.status} via browser`,
        ),
      );

      if (!refundResponse.ok) {
        if (refundResponse.status === 401 || refundResponse.status === 403) {
          steps.push(
            this.createStep(
              'refund_auth_failed',
              `Avito rejected browser session with HTTP ${refundResponse.status}`,
            ),
          );
        }
        throw this.createRunnerError(
          context,
          'DISABLE_ADS_REFUND_HTTP_ERROR',
          `Avito refund request failed with HTTP ${refundResponse.status}.`,
          {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
            requestBody: { amount: amountKopeks },
            networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
            pageUrl: refundResponse.pageUrl,
            httpStatus: refundResponse.status,
            responseJson: refundResponse.body,
            responseText: refundResponse.text,
          },
          steps,
        );
      }

      if (!this.isSuccessfulRefundResponse(refundResponse.body)) {
        steps.push(this.createStep('refund_api_rejected', 'Avito did not confirm disable ads success'));
        throw this.createRunnerError(
          context,
          'DISABLE_ADS_REFUND_API_REJECTED',
          'Avito refund endpoint did not confirm success.',
          {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
            requestBody: { amount: amountKopeks },
            networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
            pageUrl: refundResponse.pageUrl,
            httpStatus: refundResponse.status,
            responseJson: refundResponse.body,
            responseText: refundResponse.text,
          },
          steps,
        );
      }

      return {
        outcomeCode: 'DISABLE_ADS_COMPLETED',
        message: `Disable ads flow moved ${amountRubles} RUB from advance to wallet.`,
        runnerMode: 'undetectable',
        rawResult: {
          profileId: context.profile.profileId,
          walletRubles: walletBalances.walletRubles,
          advanceRubles: walletBalances.advanceRubles,
          amountRubles,
          amountKopeks,
          requestBody: { amount: amountKopeks },
          profileInfoHttpStatus: profileInfo.status,
          profileInfoResponseJson: profileInfo.body,
          profileInfoResponseText: profileInfo.text,
          httpStatus: refundResponse.status,
          responseJson: refundResponse.body,
          responseText: refundResponse.text,
          networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
          pageUrl: refundResponse.pageUrl,
        },
        steps,
      };
    } catch (error) {
      if (error instanceof ActionExecutionError) {
        throw error;
      }

      throw this.createRunnerError(
        context,
        'DISABLE_ADS_EXECUTION_ERROR',
        error instanceof Error ? error.message : 'Unknown disable ads automation error',
        {
          profileId: context.profile.profileId,
          networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
          error:
            error instanceof Error ? { name: error.name, message: error.message } : String(error),
        },
        steps,
      );
    } finally {
      if (browser) {
        await browser.disconnect();
      }
    }
  }

  private async executeBrowserWithdraw(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    const refundAction = this.getRefundAction(context, 'withdraw');
    const steps: ActionStep[] = [
      this.createStep('avito_navigation_started', 'Preparing withdraw browser-only flow'),
    ];
    this.ensureBrowserEndpoint(context, 'WITHDRAW_BROWSER_ENDPOINT_MISSING');

    let browser: Browser | null = null;
    try {
      browser = await this.connectToProfileBrowser(context);
      const page = await this.resolveAvitoTariffPage(browser, steps);
      await page.bringToFront();

      const amountRubles = refundAction.amount;
      if (!Number.isInteger(amountRubles) || amountRubles <= 0) {
        throw this.createRunnerError(
          context,
          'WITHDRAW_INVALID_AMOUNT',
          'Refund amount in rubles must be a positive integer.',
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            amountRubles,
            networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
          }),
          steps,
        );
      }

      const amountKopeks = amountRubles * 100;
      if (!Number.isSafeInteger(amountKopeks)) {
        throw this.createRunnerError(
          context,
          'WITHDRAW_INVALID_AMOUNT',
          'Refund amount in kopeks exceeds safe integer range.',
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
            networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
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

      this.logBrowserRequest(context, 'Sending Avito advance refund request via browser context', {
        amountRubles,
        amountKopeks,
      });
      const refundResponse = await this.postAdvanceRefund(page, amountKopeks);
      this.logBrowserResponse(
        context,
        'Received Avito advance refund response via browser context',
        refundResponse,
        { amountRubles, amountKopeks },
      );
      steps.push(
        this.createStep(
          'avito_refund_request_completed',
          `Avito refund endpoint responded with HTTP ${refundResponse.status} via browser`,
        ),
      );

      if (!refundResponse.ok) {
        throw this.createRunnerError(
          context,
          'WITHDRAW_REFUND_HTTP_ERROR',
          `Avito refund request failed with HTTP ${refundResponse.status}.`,
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
            requestBody: { amount: amountKopeks },
            networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
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
          'WITHDRAW_REFUND_API_REJECTED',
          'Avito refund endpoint did not confirm success.',
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
            requestBody: { amount: amountKopeks },
            networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
            httpStatus: refundResponse.status,
            responseJson: refundResponse.body,
            responseText: refundResponse.text,
          }),
          steps,
        );
      }

      steps.push(this.createStep('avito_dom_ready', 'Avito withdraw flow confirmed'));
      return {
        outcomeCode: 'WITHDRAW_COMPLETED',
        message: `Transferred ${amountRubles} RUB from advance to wallet.`,
        runnerMode: 'undetectable',
        rawResult: await this.capturePageDiagnostics(page, {
          profileId: context.profile.profileId,
          amountRubles,
          amountKopeks,
          requestBody: { amount: amountKopeks },
          networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
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
        'WITHDRAW_EXECUTION_ERROR',
        error instanceof Error ? error.message : 'Unknown withdraw automation error',
        {
          profileId: context.profile.profileId,
          networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
          error:
            error instanceof Error ? { name: error.name, message: error.message } : String(error),
        },
        steps,
      );
    } finally {
      if (browser) {
        await browser.disconnect();
      }
    }
  }

  private async executeLaunchAdsBrowserFlow(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    this.ensureBrowserEndpoint(context, 'LAUNCH_ADS_BROWSER_ENDPOINT_MISSING');

    const steps: ActionStep[] = [
      this.createStep('launch_ads_request_prepared', 'Preparing launch ads browser-only flow'),
    ];

    let browser: Browser | null = null;
    try {
      browser = await this.connectToProfileBrowser(context);
      const page = await this.resolveAvitoTariffPage(browser, steps);
      await page.bringToFront();

      const profileInfo = await this.fetchProfileInfoInBrowser(context, page, steps);
      const walletBalances = this.resolveBalancesFromProfileInfo(context, profileInfo.body, steps);
      const amountRubles =
        walletBalances.walletRubles - AvitoActionRunnerService.AUTO_TRANSFER_RESERVE_RUB;
      if (!Number.isInteger(amountRubles) || amountRubles <= 0) {
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_AUTO_AMOUNT_INVALID',
          'Avito wallet balance is too low to launch ads after reserving 1 RUB.',
          {
            profileId: context.profile.profileId,
            walletRubles: walletBalances.walletRubles,
            advanceRubles: walletBalances.advanceRubles,
            reserveRubles: AvitoActionRunnerService.AUTO_TRANSFER_RESERVE_RUB,
            profileInfoResponse: profileInfo.body,
            networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
          },
          steps,
        );
      }

      const amountKopeks = this.convertRublesToKopeks(
        context,
        amountRubles,
        'LAUNCH_ADS_INVALID_AMOUNT',
        steps,
      );
      steps.push(
        this.createStep(
          'auto_amount_calculated',
          `Detected wallet ${walletBalances.walletRubles} RUB and computed launch ads amount ${amountRubles} RUB`,
        ),
      );

      await this.resolveAvitoAdvanceAccountPage(page, amountRubles, steps);
      this.logBrowserRequest(context, 'Sending Avito create-and-pay request via browser context', {
        amountRubles,
        amountKopeks,
      });
      steps.push(
        this.createStep(
          'launch_ads_create_order_request_sent',
          'Sending Avito create-and-pay request via browser',
        ),
      );

      const createAndPayResponse = await this.postCreateAndPayInBrowser(page, amountKopeks);
      this.logBrowserResponse(
        context,
        'Received Avito create-and-pay response via browser context',
        createAndPayResponse,
        { amountRubles, amountKopeks },
      );
      steps.push(
        this.createStep(
          'launch_ads_create_order_request_completed',
          `Avito create-and-pay endpoint responded with HTTP ${createAndPayResponse.status} via browser`,
        ),
      );

      if (!createAndPayResponse.ok) {
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_ORDER_HTTP_ERROR',
          `Avito create-and-pay request failed with HTTP ${createAndPayResponse.status}.`,
          {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
            createOrderRequestBody: this.buildLaunchAdsRequestBody(amountKopeks),
            networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
            pageUrl: createAndPayResponse.pageUrl,
            httpStatus: createAndPayResponse.status,
            responseJson: createAndPayResponse.body,
            responseText: createAndPayResponse.text,
          },
          steps,
        );
      }

      const redirectUrl = this.getLaunchAdsRedirectUrl(createAndPayResponse.body);
      const paymentPageId = this.extractPaymentPageId(redirectUrl);
      if (!paymentPageId || !redirectUrl) {
        steps.push(
          this.createStep(
            'launch_ads_api_rejected',
            'Avito create-and-pay response did not contain a valid payment page redirectUrl',
          ),
        );
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_ORDER_API_REJECTED',
          'Avito create-and-pay response did not contain a valid payment page redirectUrl.',
          {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
            createOrderRequestBody: this.buildLaunchAdsRequestBody(amountKopeks),
            networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
            pageUrl: createAndPayResponse.pageUrl,
            httpStatus: createAndPayResponse.status,
            responseJson: createAndPayResponse.body,
            responseText: createAndPayResponse.text,
          },
          steps,
        );
      }

      await this.resolveAvitoPaymentPage(page, redirectUrl, paymentPageId, steps);
      this.logBrowserRequest(
        context,
        'Sending Avito payment page confirmation request via browser context',
        { paymentPageId },
      );
      steps.push(
        this.createStep(
          'launch_ads_payment_request_sent',
          `Sending Avito payment confirmation for page ${paymentPageId}`,
        ),
      );

      const paymentResponse = await this.postLaunchAdsPaymentInBrowser(page, paymentPageId);
      this.logBrowserResponse(
        context,
        'Received Avito payment page confirmation response via browser context',
        paymentResponse,
        { paymentPageId },
      );
      steps.push(
        this.createStep(
          'launch_ads_payment_request_completed',
          `Avito payment endpoint responded with HTTP ${paymentResponse.status} via browser`,
        ),
      );

      if (!paymentResponse.ok) {
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_PAYMENT_HTTP_ERROR',
          `Avito payment confirmation failed with HTTP ${paymentResponse.status}.`,
          {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
            paymentPageId,
            requestBody: this.buildLaunchAdsPaymentRequestBody(),
            networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
            pageUrl: paymentResponse.pageUrl,
            httpStatus: paymentResponse.status,
            responseJson: paymentResponse.body,
            responseText: paymentResponse.text,
          },
          steps,
        );
      }

      return {
        outcomeCode: 'LAUNCH_ADS_COMPLETED',
        message: `Created and confirmed launch ads payment for ${amountRubles} RUB.`,
        runnerMode: 'undetectable',
        rawResult: {
          profileId: context.profile.profileId,
          walletRubles: walletBalances.walletRubles,
          advanceRubles: walletBalances.advanceRubles,
          amountRubles,
          amountKopeks,
          createOrderRequestBody: this.buildLaunchAdsRequestBody(amountKopeks),
          createOrderHttpStatus: createAndPayResponse.status,
          createOrderResponseJson: createAndPayResponse.body,
          createOrderResponseText: createAndPayResponse.text,
          redirectUrl,
          paymentPageId,
          paymentRequestBody: this.buildLaunchAdsPaymentRequestBody(),
          paymentHttpStatus: paymentResponse.status,
          paymentResponseJson: paymentResponse.body,
          paymentResponseText: paymentResponse.text,
          profileInfoHttpStatus: profileInfo.status,
          profileInfoResponseJson: profileInfo.body,
          profileInfoResponseText: profileInfo.text,
          networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
          pageUrl: paymentResponse.pageUrl,
        },
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
          networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
          error:
            error instanceof Error ? { name: error.name, message: error.message } : String(error),
        },
        steps,
      );
    } finally {
      if (browser) {
        await browser.disconnect();
      }
    }
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
        currency: context.action.action === 'top_up_wallet' ? context.action.currency : null,
      },
    };
  }

  private async resolveAvitoRefundPage(browser: Browser, steps?: ActionStep[]): Promise<Page> {
    return this.resolveAvitoTariffPage(browser, steps);
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
    steps?.push(this.createStep('avito_dom_ready', `Avito tariff page ready at ${page.url()}`));
    return page;
  }

  private async resolveAvitoAccountStepPage(page: Page, steps?: ActionStep[]): Promise<void> {
    if (!page.url().startsWith(AvitoActionRunnerService.AVITO_ACCOUNT_STEP_URL)) {
      await page.goto(AvitoActionRunnerService.AVITO_ACCOUNT_STEP_URL, {
        waitUntil: 'domcontentloaded',
        timeout: AvitoActionRunnerService.TIMEOUT_MS,
      });
    }
    await this.ensurePageReady(page);
    steps?.push(this.createStep('avito_dom_ready', `Avito account page ready at ${page.url()}`));
  }

  private async resolveAvitoAdvanceAccountPage(
    page: Page,
    amountRubles: number,
    steps?: ActionStep[],
  ): Promise<void> {
    const targetUrl = `${AvitoActionRunnerService.AVITO_ADVANCE_ACCOUNT_URL}?amount=${amountRubles}`;
    if (!page.url().startsWith(AvitoActionRunnerService.AVITO_ADVANCE_ACCOUNT_URL)) {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: AvitoActionRunnerService.TIMEOUT_MS,
      });
    }
    await this.ensurePageReady(page);
    steps?.push(this.createStep('avito_dom_ready', `Avito advance page ready at ${page.url()}`));
  }

  private async resolveAvitoPaymentPage(
    page: Page,
    redirectUrl: string,
    paymentPageId: string,
    steps?: ActionStep[],
  ): Promise<void> {
    const targetUrl = new URL(redirectUrl, AvitoActionRunnerService.AVITO_BASE_URL).toString();
    if (!page.url().includes(`/payment/page/${paymentPageId}`)) {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: AvitoActionRunnerService.TIMEOUT_MS,
      });
    }
    await this.ensurePageReady(page);
    steps?.push(this.createStep('avito_dom_ready', `Avito payment page ready at ${page.url()}`));
  }

  private async fetchProfileInfoInBrowser(
    context: ActionExecutionContext,
    page: Page,
    steps: ActionStep[],
  ): Promise<BrowserHttpResult> {
    await this.resolveAvitoAccountStepPage(page, steps);
    const profileInfo = await this.executeBrowserJsonRequest(page, '/web/2/profileinfo', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
      },
      body: { isPro: true },
    });

    this.logBrowserResponse(
      context,
      'Received Avito profileinfo response via browser context',
      profileInfo,
    );

    if (!profileInfo.ok) {
      throw this.createRunnerError(
        context,
        'AVITO_PROFILEINFO_HTTP_ERROR',
        `Avito profileinfo request failed with HTTP ${profileInfo.status}.`,
        {
          profileId: context.profile.profileId,
          networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
          pageUrl: profileInfo.pageUrl,
          httpStatus: profileInfo.status,
          responseJson: profileInfo.body,
          responseText: profileInfo.text,
        },
        steps,
      );
    }

    steps.push(
      this.createStep(
        'profileinfo_loaded',
        `Avito profileinfo endpoint responded with HTTP ${profileInfo.status} via browser`,
      ),
    );
    return profileInfo;
  }

  private async postAdvanceRefund(page: Page, amountKopeks: number): Promise<BrowserHttpResult> {
    return this.executeBrowserJsonRequest(page, '/web/1/tariff/cpa/advance-refund', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
      },
      body: { amount: amountKopeks },
    });
  }

  private async postCreateAndPayInBrowser(
    page: Page,
    amountKopeks: number,
  ): Promise<BrowserHttpResult> {
    return this.executeBrowserJsonRequest(page, '/web/1/mnz/order/create-and-pay', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
      },
      body: this.buildLaunchAdsRequestBody(amountKopeks),
    });
  }

  private async postLaunchAdsPaymentInBrowser(
    page: Page,
    paymentPageId: string,
  ): Promise<BrowserHttpResult> {
    return this.executeBrowserJsonRequest(
      page,
      `/web/1/payment/page/${paymentPageId}/payment`,
      {
        method: 'POST',
        headers: {
          accept: '*/*',
          'content-type': 'application/json',
        },
        body: this.buildLaunchAdsPaymentRequestBody(),
      },
    );
  }

  private buildLaunchAdsRequestBody(amountKopeks: number) {
    return {
      backURL: '/account?action=cpa',
      items: [
        {
          cpaAdvance: amountKopeks,
          serviceID: 104,
          pageFrom: 'profile',
        },
      ],
    };
  }

  private buildLaunchAdsPaymentRequestBody() {
    return {
      paymentMethodID: 7,
      methodDetails: {
        internalWallet: {
          walletType: 'individual',
        },
      },
    };
  }

  private resolveBalancesFromProfileInfo(
    context: ActionExecutionContext,
    body: unknown,
    steps: ActionStep[],
  ) {
    try {
      const payload = body as AvitoProfileInfoResponse | null;
      const tiles = Array.isArray(payload?.tiles) ? payload.tiles : null;
      if (!tiles) {
        throw new Error('Avito profileinfo response does not contain tiles.');
      }

      const walletTile = tiles.find((tile) => tile?.title === '\u041a\u043e\u0448\u0435\u043b\u0451\u043a');
      const advanceTile = tiles.find((tile) => tile?.title === '\u0410\u0432\u0430\u043d\u0441');
      if (!walletTile || !advanceTile) {
        throw new Error('Avito profileinfo response does not contain wallet or advance tiles.');
      }

      const walletRubles = this.parseRublesFromTileValue(walletTile.value);
      const advanceRubles = this.parseRublesFromTileValue(advanceTile.value);
      steps.push(
        this.createStep(
          'profileinfo_balances_parsed',
          `Parsed wallet ${walletRubles} RUB and advance ${advanceRubles} RUB from Avito profileinfo`,
        ),
      );
      return { walletRubles, advanceRubles };
    } catch (error) {
      throw this.createRunnerError(
        context,
        'AVITO_PROFILEINFO_PARSE_ERROR',
        error instanceof Error ? error.message : 'Failed to parse Avito profileinfo response.',
        {
          profileId: context.profile.profileId,
          networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
          profileInfoResponse: body,
        },
        steps,
      );
    }
  }

  private parseRublesFromTileValue(value: unknown) {
    if (typeof value !== 'string') {
      throw new Error('Avito balance value is not a string.');
    }

    const normalized = value.replace(/[\s\u00A0\u202F\u20BD]/gu, '');
    if (!/^\d+$/u.test(normalized)) {
      throw new Error(`Avito balance value "${value}" could not be parsed as integer RUB.`);
    }

    return Number(normalized);
  }

  private convertRublesToKopeks(
    context: ActionExecutionContext,
    amountRubles: number,
    outcomeCode: string,
    steps: ActionStep[],
  ) {
    if (!Number.isInteger(amountRubles) || amountRubles <= 0) {
      throw this.createRunnerError(
        context,
        outcomeCode,
        'Action amount in rubles must be a positive integer.',
        {
          profileId: context.profile.profileId,
          amountRubles,
          networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
        },
        steps,
      );
    }

    const amountKopeks = amountRubles * 100;
    if (!Number.isSafeInteger(amountKopeks)) {
      throw this.createRunnerError(
        context,
        outcomeCode,
        'Action amount in kopeks exceeds safe integer range.',
        {
          profileId: context.profile.profileId,
          amountRubles,
          amountKopeks,
          networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
        },
        steps,
      );
    }

    steps.push(
      this.createStep(
        'amount_converted',
        `Converted action amount ${amountRubles} RUB to ${amountKopeks} kopeks`,
      ),
    );
    return amountKopeks;
  }

  private async executeBrowserJsonRequest(
    page: Page,
    input: string,
    init: {
      method: string;
      headers?: Record<string, string>;
      body?: unknown;
    },
  ): Promise<BrowserHttpResult> {
    return page.evaluate(
      async ({ requestInput, requestInit }) => {
        const response = await fetch(requestInput, {
          method: requestInit.method,
          credentials: 'include',
          headers: requestInit.headers,
          body: requestInit.body === undefined ? undefined : JSON.stringify(requestInit.body),
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
          pageUrl: window.location.href,
        };
      },
      {
        requestInput: input,
        requestInit: init,
      },
    );
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

  private getLaunchAdsRedirectUrl(body: unknown) {
    if (!body || typeof body !== 'object') {
      return null;
    }

    const payload = body as { redirectUrl?: unknown };
    return typeof payload.redirectUrl === 'string' && payload.redirectUrl.length > 0
      ? payload.redirectUrl
      : null;
  }

  private extractPaymentPageId(redirectUrl: string | null) {
    if (!redirectUrl) {
      return null;
    }

    try {
      const parsed = new URL(redirectUrl, AvitoActionRunnerService.AVITO_BASE_URL);
      const match = parsed.pathname.match(/\/payment\/page\/([^/]+)/u);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  private getRefundAction(
    context: ActionExecutionContext,
    action: WithdrawPayload['action'],
  ): WithdrawPayload {
    if (context.action.action !== action) {
      throw new Error(`Expected refund action ${action}, got ${context.action.action}`);
    }

    return context.action;
  }

  private ensureBrowserEndpoint(context: ActionExecutionContext, outcomeCode: string): void {
    if (!context.runtimeSnapshot.websocketLink && !context.runtimeSnapshot.debugPort) {
      throw this.createRunnerError(
        context,
        outcomeCode,
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

  private logBrowserRequest(
    context: ActionExecutionContext,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    this.logger.log({
      message,
      action: context.action.action,
      jobId: context.job.id,
      jobItemId: context.jobItem.id,
      correlationId: context.correlationId,
      profileId: context.profile.profileId,
      networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
      ...details,
    });
  }

  private logBrowserResponse(
    context: ActionExecutionContext,
    message: string,
    result: BrowserHttpResult,
    details: Record<string, unknown> = {},
  ) {
    this.logger.log({
      message,
      action: context.action.action,
      jobId: context.job.id,
      jobItemId: context.jobItem.id,
      correlationId: context.correlationId,
      profileId: context.profile.profileId,
      networkSource: AvitoActionRunnerService.NETWORK_SOURCE,
      pageUrl: result.pageUrl,
      httpStatus: result.status,
      ok: result.ok,
      responseJson: result.body,
      responseText: result.text,
      ...details,
    });
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
