import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { type Browser, type Page } from 'puppeteer';

import {
  ActionExecutionError,
  type ActionStep,
  type AvitoActionResult,
  type ActionExecutionContext,
  type AvitoActionRunner,
  type LaunchAdsPayload,
  type RefundActionPayload,
  type RunnerExecutionResult,
} from './profile-actions.types';
import { type UndetectableCookie } from '../profiles/undetectable-api.service';

@Injectable()
export class AvitoActionRunnerService implements AvitoActionRunner {
  private static readonly AVITO_WITHDRAW_URL = 'https://www.avito.ru/tariff/cpa/profile';
  private static readonly AVITO_BASE_URL = 'https://www.avito.ru/';
  private static readonly AVITO_ADVANCE_ACCOUNT_URL = 'https://www.avito.ru/account/advance';
  private static readonly AVITO_ADVANCE_REFUND_URL =
    'https://www.avito.ru/web/1/tariff/cpa/advance-refund';
  private static readonly AVITO_CREATE_AND_PAY_URL =
    'https://www.avito.ru/web/1/mnz/order/create-and-pay';
  private static readonly TIMEOUT_MS = 20_000;
  private readonly logger = new Logger(AvitoActionRunnerService.name);

  async executeWithdraw(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
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

  private async executeDisableAds(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    const refundAction = this.getRefundAction(context, 'disable_ads');
    const steps: ActionStep[] = [
      this.createStep('refund_request_prepared', 'Preparing disable ads request-only flow'),
    ];
    const amountRubles = refundAction.amount;

    if (!Number.isInteger(amountRubles) || amountRubles <= 0) {
      throw this.createRunnerError(
        context,
        'DISABLE_ADS_INVALID_AMOUNT',
        'Refund amount in rubles must be a positive integer.',
        {
          profileId: context.profile.profileId,
          amountRubles,
        },
        steps,
      );
    }

    const amountKopeks = amountRubles * 100;
    if (!Number.isSafeInteger(amountKopeks)) {
      throw this.createRunnerError(
        context,
        'DISABLE_ADS_INVALID_AMOUNT',
        'Refund amount in kopeks exceeds safe integer range.',
        {
          profileId: context.profile.profileId,
          amountRubles,
          amountKopeks,
        },
        steps,
      );
    }

    steps.push(
      this.createStep(
        'avito_refund_amount_converted',
        `Converted refund amount ${amountRubles} RUB to ${amountKopeks} kopeks`,
      ),
    );
    const cookies = await this.getCookiesViaBrowser(context);
    const avitoCookies = this.filterAvitoCookies(cookies);
    if (!avitoCookies.length) {
      steps.push(this.createStep('refund_auth_failed', 'No Avito cookies were found in profile'));
      throw this.createRunnerError(
        context,
        'DISABLE_ADS_COOKIES_MISSING',
        'Profile does not contain Avito cookies required for disable ads request.',
        {
          profileId: context.profile.profileId,
          cookieCount: cookies.length,
          avitoCookieCount: 0,
        },
        steps,
      );
    }

    const cookieHeader = this.buildCookieHeader(avitoCookies);
    if (!cookieHeader) {
      steps.push(this.createStep('refund_auth_failed', 'Avito cookies could not be serialized'));
      throw this.createRunnerError(
        context,
        'DISABLE_ADS_COOKIES_INVALID',
        'Avito cookies could not be serialized into Cookie header.',
        {
          profileId: context.profile.profileId,
          cookieCount: cookies.length,
          avitoCookieCount: avitoCookies.length,
        },
        steps,
      );
    }

    steps.push(
      this.createStep(
        'cookies_resolved',
        `Resolved ${avitoCookies.length} Avito cookies for request-only flow via devtools`,
      ),
    );

    this.logger.log({
      message: 'Sending Avito advance refund request via cookies',
      action: context.action.action,
      jobId: context.job.id,
      jobItemId: context.jobItem.id,
      correlationId: context.correlationId,
      profileId: context.profile.profileId,
      amountRubles,
      amountKopeks,
      cookieCount: avitoCookies.length,
    });
    steps.push(this.createStep('refund_request_sent', 'Sending Avito advance refund HTTP request'));

    const refundResponse = await this.postAdvanceRefundByCookies(
      context,
      amountKopeks,
      cookieHeader,
      avitoCookies,
    );

    this.logger.log({
      message: 'Received Avito advance refund response via cookies',
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
        'refund_request_completed',
        `Avito refund endpoint responded with HTTP ${refundResponse.status}`,
      ),
    );

    if (!refundResponse.ok) {
      if (refundResponse.status === 401 || refundResponse.status === 403) {
        steps.push(
          this.createStep(
            'refund_auth_failed',
            `Avito rejected cookies with HTTP ${refundResponse.status}`,
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
        amountRubles,
        amountKopeks,
        requestBody: { amount: amountKopeks },
        httpStatus: refundResponse.status,
        responseJson: refundResponse.body,
        responseText: refundResponse.text,
        cookieCount: avitoCookies.length,
        cookieSource: 'devtools',
      },
      steps,
    };
  }

  private async executeBrowserWithdraw(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    const refundAction = this.getRefundAction(context, 'withdraw');
    const actionLabel = 'withdraw';

    if (!context.runtimeSnapshot.websocketLink && !context.runtimeSnapshot.debugPort) {
      throw this.createRunnerError(
        context,
        'WITHDRAW_BROWSER_ENDPOINT_MISSING',
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
      const amountRubles = refundAction.amount;

      if (!Number.isInteger(amountRubles) || amountRubles <= 0) {
        throw this.createRunnerError(
          context,
          'WITHDRAW_INVALID_AMOUNT',
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
          'WITHDRAW_INVALID_AMOUNT',
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
          'WITHDRAW_REFUND_HTTP_ERROR',
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
          'WITHDRAW_REFUND_API_REJECTED',
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
        outcomeCode: 'WITHDRAW_COMPLETED',
        message: `Transferred ${amountRubles} RUB from advance to wallet.`,
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
        'WITHDRAW_EXECUTION_ERROR',
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
    return this.executeLaunchAdsRequestFlow(context);

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

      const page = await this.resolveAvitoTopUpPage(browser as Browser, steps);
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

      const resolvedBalance = balance!;
      const amountToTopUp = Math.floor(resolvedBalance.parsed) - 1;
      if (amountToTopUp <= 0) {
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_AMOUNT_NON_POSITIVE',
          'Top up amount is non-positive after applying balance - 1 rule.',
          await this.capturePageDiagnostics(page, {
            profileId: context.profile.profileId,
            rawBalanceText: resolvedBalance.rawText,
            parsedBalance: resolvedBalance.parsed,
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
            rawBalanceText: resolvedBalance.rawText,
            parsedBalance: resolvedBalance.parsed,
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
            rawBalanceText: resolvedBalance.rawText,
            parsedBalance: resolvedBalance.parsed,
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
          rawBalanceText: resolvedBalance.rawText,
          parsedBalance: resolvedBalance.parsed,
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
    } catch (error: any) {
      if (error instanceof ActionExecutionError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown launch ads automation error';
      const errorDetails =
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error);

      throw this.createRunnerError(
        context,
        'LAUNCH_ADS_EXECUTION_ERROR',
        errorMessage,
        {
          profileId: context.profile.profileId,
          error: errorDetails,
        },
        steps,
      );
    } finally {
      if (browser) {
        await browser!.disconnect();
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

  private async executeLaunchAdsRequestFlow(
    context: ActionExecutionContext,
  ): Promise<RunnerExecutionResult> {
    const launchAdsAction = this.getLaunchAdsAction(context);
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

    const steps: ActionStep[] = [
      this.createStep('launch_ads_request_prepared', 'Preparing launch ads request-only flow'),
    ];

    try {
      const amountRubles = launchAdsAction.amount;
      if (!Number.isInteger(amountRubles) || amountRubles <= 0) {
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_INVALID_AMOUNT',
          'Launch ads amount in rubles must be a positive integer.',
          {
            profileId: context.profile.profileId,
            amountRubles,
          },
          steps,
        );
      }

      const amountKopeks = amountRubles * 100;
      if (!Number.isSafeInteger(amountKopeks)) {
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_INVALID_AMOUNT',
          'Launch ads amount in kopeks exceeds safe integer range.',
          {
            profileId: context.profile.profileId,
            amountRubles,
            amountKopeks,
          },
          steps,
        );
      }

      steps.push(
        this.createStep(
          'launch_ads_amount_converted',
          `Converted launch ads amount ${amountRubles} RUB to ${amountKopeks} kopeks`,
        ),
      );

      const cookies = await this.getCookiesViaBrowser(context);
      const avitoCookies = this.filterAvitoCookies(cookies);
      if (!avitoCookies.length) {
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_COOKIES_MISSING',
          'Profile does not contain Avito cookies required for launch ads request.',
          {
            profileId: context.profile.profileId,
            cookieCount: cookies.length,
            avitoCookieCount: 0,
          },
          steps,
        );
      }

      const cookieHeader = this.buildCookieHeader(avitoCookies);
      if (!cookieHeader) {
        throw this.createRunnerError(
          context,
          'LAUNCH_ADS_COOKIES_INVALID',
          'Avito cookies could not be serialized into Cookie header.',
          {
            profileId: context.profile.profileId,
            cookieCount: cookies.length,
            avitoCookieCount: avitoCookies.length,
          },
          steps,
        );
      }

      steps.push(
        this.createStep(
          'cookies_resolved',
          `Resolved ${avitoCookies.length} Avito cookies for launch ads request`,
        ),
      );

      this.logger.log({
        message: 'Sending Avito create-and-pay request',
        action: context.action.action,
        jobId: context.job.id,
        jobItemId: context.jobItem.id,
        correlationId: context.correlationId,
        profileId: context.profile.profileId,
        amountRubles,
        amountKopeks,
      });
      steps.push(
        this.createStep(
          'launch_ads_order_request_sent',
          'Sending Avito create-and-pay HTTP request',
        ),
      );

      const createAndPayResponse = await this.postCreateAndPayByCookies(
        amountKopeks,
        cookieHeader,
        avitoCookies,
      );

      this.logger.log({
        message: 'Received Avito create-and-pay response',
        action: context.action.action,
        jobId: context.job.id,
        jobItemId: context.jobItem.id,
        correlationId: context.correlationId,
        profileId: context.profile.profileId,
        amountRubles,
        amountKopeks,
        httpStatus: createAndPayResponse.status,
        ok: createAndPayResponse.ok,
        responseJson: createAndPayResponse.body,
        responseText: createAndPayResponse.text,
      });
      steps.push(
        this.createStep(
          'launch_ads_order_request_completed',
          `Avito create-and-pay endpoint responded with HTTP ${createAndPayResponse.status}`,
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
            requestBody: this.buildLaunchAdsRequestBody(amountKopeks),
            httpStatus: createAndPayResponse.status,
            responseJson: createAndPayResponse.body,
            responseText: createAndPayResponse.text,
          },
          steps,
        );
      }

      const redirectUrl = this.getLaunchAdsRedirectUrl(createAndPayResponse.body);
      const paymentPageId = this.extractPaymentPageId(redirectUrl);
      if (!paymentPageId) {
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
            requestBody: this.buildLaunchAdsRequestBody(amountKopeks),
            httpStatus: createAndPayResponse.status,
            responseJson: createAndPayResponse.body,
            responseText: createAndPayResponse.text,
          },
          steps,
        );
      }

      this.logger.log({
        message: 'Sending Avito payment page confirmation request',
        action: context.action.action,
        jobId: context.job.id,
        jobItemId: context.jobItem.id,
        correlationId: context.correlationId,
        profileId: context.profile.profileId,
        paymentPageId,
      });
      steps.push(
        this.createStep(
          'launch_ads_payment_request_sent',
          `Sending Avito payment confirmation for page ${paymentPageId}`,
        ),
      );

      const paymentResponse = await this.postLaunchAdsPaymentByCookies(
        paymentPageId,
        cookieHeader,
        avitoCookies,
      );

      this.logger.log({
        message: 'Received Avito payment page confirmation response',
        action: context.action.action,
        jobId: context.job.id,
        jobItemId: context.jobItem.id,
        correlationId: context.correlationId,
        profileId: context.profile.profileId,
        paymentPageId,
        httpStatus: paymentResponse.status,
        ok: paymentResponse.ok,
        responseJson: paymentResponse.body,
        responseText: paymentResponse.text,
      });
      steps.push(
        this.createStep(
          'launch_ads_payment_request_completed',
          `Avito payment endpoint responded with HTTP ${paymentResponse.status}`,
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
          cookieCount: avitoCookies.length,
          cookieSource: 'devtools',
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
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : String(error),
        },
        steps,
      );
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

  private async postAdvanceRefundByCookies(
    context: ActionExecutionContext,
    amountKopeks: number,
    cookieHeader: string,
    cookies: UndetectableCookie[],
  ): Promise<{
    ok: boolean;
    status: number;
    body: unknown;
    text: string | null;
  }> {
    const headers = new Headers({
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      cookie: cookieHeader,
      origin: 'https://www.avito.ru',
      referer: AvitoActionRunnerService.AVITO_WITHDRAW_URL,
    });
    const userAgent = this.resolveUserAgent(cookies);
    if (userAgent) {
      headers.set('user-agent', userAgent);
    }

    const response = await fetch(AvitoActionRunnerService.AVITO_ADVANCE_REFUND_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount: amountKopeks }),
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

  private async postCreateAndPayByCookies(
    amountKopeks: number,
    cookieHeader: string,
    cookies: UndetectableCookie[],
  ): Promise<{
    ok: boolean;
    status: number;
    body: unknown;
    text: string | null;
  }> {
    const headers = new Headers({
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      cookie: cookieHeader,
      origin: 'https://www.avito.ru',
      referer: `${AvitoActionRunnerService.AVITO_ADVANCE_ACCOUNT_URL}?amount=${Math.floor(amountKopeks / 100)}`,
    });
    const userAgent = this.resolveUserAgent(cookies);
    if (userAgent) {
      headers.set('user-agent', userAgent);
    }

    const response = await fetch(AvitoActionRunnerService.AVITO_CREATE_AND_PAY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(this.buildLaunchAdsRequestBody(amountKopeks)),
    });

    return this.parseHttpResponse(response);
  }

  private async postLaunchAdsPaymentByCookies(
    paymentPageId: string,
    cookieHeader: string,
    cookies: UndetectableCookie[],
  ): Promise<{
    ok: boolean;
    status: number;
    body: unknown;
    text: string | null;
  }> {
    const headers = new Headers({
      accept: '*/*',
      'content-type': 'application/json',
      cookie: cookieHeader,
      origin: 'https://www.avito.ru',
      referer: `https://www.avito.ru/payment/page/${paymentPageId}?ps=1`,
    });
    const userAgent = this.resolveUserAgent(cookies);
    if (userAgent) {
      headers.set('user-agent', userAgent);
    }

    const response = await fetch(
      `https://www.avito.ru/web/1/payment/page/${paymentPageId}/payment`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(this.buildLaunchAdsPaymentRequestBody()),
      },
    );

    return this.parseHttpResponse(response);
  }

  private async parseHttpResponse(response: Response): Promise<{
    ok: boolean;
    status: number;
    body: unknown;
    text: string | null;
  }> {
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

  private filterAvitoCookies(cookies: UndetectableCookie[]) {
    return cookies.filter((cookie) => {
      if (typeof cookie.name !== 'string' || typeof cookie.value !== 'string') {
        return false;
      }

      const domain = cookie.domain?.toLowerCase() ?? '';
      return domain === 'avito.ru' || domain.endsWith('.avito.ru');
    });
  }

  private buildCookieHeader(cookies: UndetectableCookie[]) {
    return cookies
      .filter(
        (cookie) =>
          typeof cookie.name === 'string' &&
          cookie.name.length > 0 &&
          typeof cookie.value === 'string',
      )
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }

  private resolveUserAgent(cookies: UndetectableCookie[]) {
    const userAgentCookie = cookies.find((cookie) => cookie.name === 'user-agent');
    return typeof userAgentCookie?.value === 'string' && userAgentCookie.value.length > 0
      ? userAgentCookie.value
      : null;
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
      const parsed = new URL(redirectUrl);
      const match = parsed.pathname.match(/\/payment\/page\/([^/]+)/u);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  private getRefundAction(
    context: ActionExecutionContext,
    action: RefundActionPayload['action'],
  ): RefundActionPayload {
    if (context.action.action !== action) {
      throw new Error(`Expected refund action ${action}, got ${context.action.action}`);
    }

    return context.action;
  }

  private getLaunchAdsAction(context: ActionExecutionContext): LaunchAdsPayload {
    if (context.action.action !== 'launch_ads') {
      throw new Error(`Expected launch_ads action, got ${context.action.action}`);
    }

    return context.action;
  }

  private async getCookiesViaBrowser(context: ActionExecutionContext): Promise<UndetectableCookie[]> {
    if (!context.runtimeSnapshot.websocketLink && !context.runtimeSnapshot.debugPort) {
      throw new Error('Browser endpoint is missing for DevTools cookie fallback');
    }

    this.logger.log({
      message: 'Reading Avito cookies via DevTools',
      correlationId: context.correlationId,
      profileId: context.profile.profileId,
    });

    let browser: Browser | null = null;
    try {
      browser = await this.connectToProfileBrowser(context);
      const pages = await browser.pages();
      const page = pages[0] ?? (await browser.newPage());
      const client = await page.target().createCDPSession();
      const result = await client.send('Network.getCookies', {
        urls: [
          AvitoActionRunnerService.AVITO_BASE_URL,
          AvitoActionRunnerService.AVITO_WITHDRAW_URL,
        ],
      });

      return Array.isArray(result.cookies)
        ? result.cookies.map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expires: cookie.expires,
            sameSite: typeof cookie.sameSite === 'string' ? cookie.sameSite : undefined,
          }))
        : [];
    } finally {
      if (browser) {
        await browser.disconnect();
      }
    }
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
