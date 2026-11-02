import {
  expect,
  test,
  type Route,
} from '@playwright/test'


const runtimeOrigin =
  'http://127.0.0.1:2024'


const pathOf = (
  value: string,
): string =>
  new URL(value).pathname


test(
  'replaces provisional stream projection with persisted ThreadState authority',
  async ({
    page,
  }, testInfo) => {
    let releaseStateRequest:
      (() => void) | null =
        null

    const stateRequestReleased =
      new Promise<void>(
        (resolve) => {
          releaseStateRequest =
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


    let delayedStateRequest =
      false

    let persistedStatePath:
      string | null =
        null


    await page.route(
      `${runtimeOrigin}/threads/*/state`,
      async (
        route: Route,
      ) => {
        const request =
          route.request()

        const path =
          pathOf(
            request.url(),
          )


        if (
          !delayedStateRequest &&
          request.method() ===
            'GET' &&
          /^\/threads\/[^/]+\/state$/.test(
            path,
          )
        ) {
          delayedStateRequest =
            true

          persistedStatePath =
            path

          signalStateRequest?.()

          /*
           * Deliberately hold persisted reconciliation open.
           *
           * This creates a deterministic browser-visible window
           * where:
           *
           * Run = reconciled
           * ThreadState = not reconciled yet
           * live messages = still visible
           */
          await stateRequestReleased

          await route.continue()

          return
        }


        await route.continue()
      },
    )


    const runGets:
      string[] = []

    const stateGets:
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


        if (
          /^\/threads\/[^/]+\/state$/.test(
            path,
          )
        ) {
          stateGets.push(
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


    const assistantMessages =
      page.locator(
        '.message[data-role="assistant"]',
      )


    await expect(
      page.getByLabel(
        'Assistant',
      ),
    ).toBeEnabled()


    await userInput.fill(
      'Respond exactly: PW_PERSISTED_RECONCILE_OK',
    )


    await createRun.click()


    await expect(
      phase,
    ).toHaveAttribute(
      'data-phase',
      'streaming',
      {
        timeout:
          30_000,
      },
    )


    /*
     * Prove that provisional streaming output becomes visible
     * before persisted ThreadState reconciliation.
     */
    await expect(
      assistantMessages,
    ).toHaveCount(
      1,
      {
        timeout:
          60_000,
      },
    )


    await expect(
      assistantMessages.first(),
    ).toContainText(
      'PW_PERSISTED_RECONCILE_OK',
      {
        timeout:
          60_000,
      },
    )


    /*
     * Wait until useExecution has:
     *
     * 1. consumed SSE EOF;
     * 2. fetched the Run;
     * 3. observed terminal lifecycle;
     * 4. started GET ThreadState.
     *
     * The GET /state is deliberately blocked by page.route.
     */
    await stateRequestObserved


    await expect(
      phase,
    ).toHaveAttribute(
      'data-phase',
      'refreshing-state',
    )


    /*
     * Run lifecycle is already authoritative here.
     */
    await expect(
      runStatus,
    ).toHaveText(
      'success',
    )


    /*
     * Persisted graph authority has NOT arrived yet.
     *
     * New Thread means there is no older ThreadState to display.
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
      'live',
    )


    /*
     * Provisional live message must remain visible while state
     * reconciliation is pending.
     */
    await expect(
      assistantMessages,
    ).toHaveCount(1)


    await expect(
      assistantMessages.first(),
    ).toContainText(
      'PW_PERSISTED_RECONCILE_OK',
    )


    const beforeScreenshot =
      testInfo.outputPath(
        'before-persisted-state.png',
      )


    await page.screenshot({
      path:
        beforeScreenshot,

      fullPage:
        true,
    })


    await testInfo.attach(
      'before-persisted-state',
      {
        path:
          beforeScreenshot,

        contentType:
          'image/png',
      },
    )


    /*
     * Allow GET ThreadState to reach the Runtime.
     */
    releaseStateRequest?.()


    await expect(
      phase,
    ).toHaveAttribute(
      'data-phase',
      'completed',
      {
        timeout:
          30_000,
      },
    )


    /*
     * Persisted state now owns graph position and checkpoint.
     */
    await expect(
      runStatus,
    ).toHaveText(
      'success',
    )


    await expect(
      graphNext,
    ).toHaveText(
      'END',
    )


    await expect(
      checkpoint,
    ).not.toHaveText(
      '—',
    )

    await expect(
      messageAuthority,
    ).toHaveText(
      'persisted',
    )


    /*
     * Persisted reconciliation must replace provisional message
     * projection without duplicating or losing the message.
     */
    await expect(
      assistantMessages,
    ).toHaveCount(1)


    await expect(
      assistantMessages.first(),
    ).toContainText(
      'PW_PERSISTED_RECONCILE_OK',
    )


    const finalText =
      await assistantMessages
        .first()
        .textContent()


    expect(
      (
        finalText
          ?.match(
            /PW_PERSISTED_RECONCILE_OK/g,
          ) ??
        []
      ).length,
    ).toBe(1)


    /*
     * Reconciliation topology must remain exactly:
     *
     * GET Run
     * GET ThreadState
     */
    expect(
      runGets,
    ).toHaveLength(1)

    expect(
      stateGets,
    ).toHaveLength(1)


    expect(
      persistedStatePath,
    ).toBe(
      stateGets[0],
    )


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
      stateGets[0],
    ).toBe(
      `/threads/${threadId}/state`,
    )


    await testInfo.attach(
      'persisted-reconciliation-evidence',
      {
        body:
          JSON.stringify(
            {
              threadId,
              runId,
              runGets,
              stateGets,

              beforePersistedState: {
                phase:
                  'refreshing-state',

                runStatus:
                  'success',

                graphNext:
                  null,

                checkpoint:
                  null,

                assistantVisible:
                  true,
              },

              afterPersistedState: {
                phase:
                  'completed',

                runStatus:
                  'success',

                graphNext:
                  'END',

                checkpoint:
                  'populated',

                assistantVisible:
                  true,
              },
            },
            null,
            2,
          ),

        contentType:
          'application/json',
      },
    )


    const afterScreenshot =
      testInfo.outputPath(
        'after-persisted-state.png',
      )


    await page.screenshot({
      path:
        afterScreenshot,

      fullPage:
        true,
    })


    await testInfo.attach(
      'after-persisted-state',
      {
        path:
          afterScreenshot,

        contentType:
          'image/png',
      },
    )
  },
)
