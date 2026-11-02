import {
  expect,
  test,
} from '@playwright/test'


const runtimeOrigin =
  'http://127.0.0.1:2024'


const pathOf = (
  value: string,
): string =>
  new URL(value).pathname


test(
  'preserves provisional output when persisted ThreadState reconciliation fails',
  async ({
    page,
  }, testInfo) => {
    let failedStateRequest =
      false

    let stateRequestPath:
      string | null =
        null


    let releaseStateFailure:
      (() => void) | null =
        null

    const stateFailureReleased =
      new Promise<void>(
        (resolve) => {
          releaseStateFailure =
            resolve
        },
      )


    let signalStateRequest:
      (() => void) | null =
        null

    const stateRequestObserved =
      new Promise<void>(
        (resolve) => {
          signalStateRequest =
            resolve
        },
      )


    /*
     * Fail only the first final ThreadState GET.
     *
     * The execution itself and Run lifecycle remain real.
     */
    await page.route(
      `${runtimeOrigin}/threads/*/state`,
      async (route) => {
        const request =
          route.request()

        const path =
          pathOf(
            request.url(),
          )


        if (
          !failedStateRequest &&
          request.method() ===
            'GET' &&
          /^\/threads\/[^/]+\/state$/.test(
            path,
          )
        ) {
          failedStateRequest =
            true

          stateRequestPath =
            path

          /*
           * Tell the test that persisted reconciliation has
           * started, but do not fail it yet.
           *
           * This creates a deterministic browser-visible
           * refreshing-state window.
           */
          signalStateRequest?.()

          await stateFailureReleased

          await route.fulfill({
            status:
              503,

            contentType:
              'application/json',

            body:
              JSON.stringify({
                detail:
                  'Playwright simulated persisted-state reconciliation failure',
              }),
          })

          return
        }


        await route.continue()
      },
    )


    const runGets:
      string[] = []


    page.on(
      'request',
      (request) => {
        if (
          request.method() !==
          'GET'
        ) {
          return
        }

        const path =
          pathOf(
            request.url(),
          )


        if (
          /^\/threads\/[^/]+\/runs\/[^/]+$/.test(
            path,
          )
        ) {
          runGets.push(
            path,
          )
        }
      },
    )


    await page.goto('/')


    const phase =
      page.locator(
        '#execution .execution-phase',
      )


    const userInput =
      page.getByLabel(
        'User input',
      )


    const createRun =
      page.getByRole(
        'button',
        {
          name:
            'Create Run',
        },
      )


    const fact = (
      label: string,
    ) =>
      page
        .locator(
          '.execution-facts article',
        )
        .filter({
          hasText:
            label,
        })
        .locator(
          'strong',
        )


    const runStatus =
      fact(
        'Run status',
      )

    const graphNext =
      fact(
        'Graph next',
      )

    const checkpoint =
      fact(
        'Checkpoint',
      )

    const messageAuthority =
      fact(
        'Message authority',
      )


    const assistantCards =
      page.locator(
        '.message[data-role="assistant"]',
      )


    const assistantContent =
      assistantCards
        .first()
        .locator(
          '.message-content pre',
        )
        .first()


    const errorAlert =
      page.getByRole(
        'alert',
      )


    await userInput.fill(
      'Respond exactly: PW_RECONCILIATION_FAILURE_OK',
    )


    await createRun.click()


    /*
     * Prove that live output existed before persisted-state
     * reconciliation failed.
     */
    await expect(
      assistantCards,
    ).toHaveCount(
      1,
      {
        timeout:
          60_000,
      },
    )


    await expect(
      assistantContent,
    ).toContainText(
      'PW_RECONCILIATION_FAILURE_OK',
      {
        timeout:
          60_000,
      },
    )


    const provisionalText =
      await assistantContent
        .textContent()


    expect(
      provisionalText,
    ).not.toBeNull()


    /*
     * Wait until the application has:
     *
     * 1. consumed stream EOF;
     * 2. reconciled the Run resource;
     * 3. started GET ThreadState.
     *
     * The intercepted GET /state is still pending here.
     */
    await stateRequestObserved


    await expect(
      phase,
    ).toHaveAttribute(
      'data-phase',
      'refreshing-state',
    )


    await expect(
      runStatus,
    ).toHaveText(
      'success',
    )


    await expect(
      graphNext,
    ).toHaveText(
      '—',
    )


    await expect(
      checkpoint,
    ).toHaveText(
      '—',
    )


    await expect(
      messageAuthority,
    ).toHaveText(
      'live',
    )


    await expect(
      assistantCards,
    ).toHaveCount(1)


    await expect(
      assistantContent,
    ).toHaveText(
      provisionalText!,
    )


    /*
     * Only now let persisted reconciliation fail.
     */
    releaseStateFailure?.()


    /*
     * GET Run must succeed first.
     *
     * Then our mocked GET ThreadState returns 503 and the hook
     * transitions through its catch path.
     */
    await expect(
      phase,
    ).toHaveAttribute(
      'data-phase',
      'failed',
      {
        timeout:
          60_000,
      },
    )


    expect(
      failedStateRequest,
    ).toBe(true)


    expect(
      stateRequestPath,
    ).not.toBeNull()


    /*
     * Lifecycle reconciliation succeeded before state
     * reconciliation failed.
     */
    await expect(
      runStatus,
    ).toHaveText(
      'success',
    )


    expect(
      runGets,
    ).toHaveLength(1)


    /*
     * Persisted graph authority was never obtained.
     */
    await expect(
      graphNext,
    ).toHaveText(
      '—',
    )


    await expect(
      checkpoint,
    ).toHaveText(
      '—',
    )

    await expect(
      messageAuthority,
    ).toHaveText(
      'unreconciled',
    )


    /*
     * Current implementation intentionally preserves provisional
     * output through the catch path.
     *
     * We test the existing behavior first before deciding whether
     * the UI needs explicit provenance.
     */
    await expect(
      assistantCards,
    ).toHaveCount(1)


    await expect(
      assistantContent,
    ).toHaveText(
      provisionalText!,
    )


    await expect(
      errorAlert,
    ).toBeVisible()


    const errorText =
      await errorAlert
        .textContent()


    expect(
      errorText,
    ).toBeTruthy()


    const runMatch =
      /^\/threads\/([^/]+)\/runs\/([^/]+)$/
        .exec(
          runGets[0]!,
        )


    expect(
      runMatch,
    ).not.toBeNull()


    const threadId =
      runMatch![1]

    const runId =
      runMatch![2]


    expect(
      stateRequestPath,
    ).toBe(
      `/threads/${threadId}/state`,
    )


    await testInfo.attach(
      'reconciliation-failure-evidence',
      {
        body:
          JSON.stringify(
            {
              threadId,
              runId,

              lifecycle: {
                runStatus:
                  'success',
              },

              persistedState: {
                request:
                  stateRequestPath,

                result:
                  '503 simulated',

                graphNextKnown:
                  false,

                checkpointKnown:
                  false,
              },

              provisionalProjection: {
                assistantCount:
                  1,

                preservedAfterFailure:
                  true,

                text:
                  provisionalText,
              },

              frontend: {
                phase:
                  'failed',

                errorVisible:
                  true,

                errorText,
              },
            },
            null,
            2,
          ),

        contentType:
          'application/json',
      },
    )


    const screenshotPath =
      testInfo.outputPath(
        'persisted-reconciliation-failed.png',
      )


    await page.screenshot({
      path:
        screenshotPath,

      fullPage:
        true,
    })


    await testInfo.attach(
      'persisted-reconciliation-failed-ui',
      {
        path:
          screenshotPath,

        contentType:
          'image/png',
      },
    )
  },
)
