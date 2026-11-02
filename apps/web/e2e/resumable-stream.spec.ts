import {
  expect,
  test,
  type Request,
} from '@playwright/test'


const initialStreamPath =
  /^\/threads\/[^/]+\/runs\/stream$/

const resumedStreamPath =
  /^\/threads\/([^/]+)\/runs\/([^/]+)\/stream$/


const pathOf = (
  request: Request,
): string =>
  new URL(
    request.url(),
  ).pathname


test(
  'reconnects the same Runtime Run after an SSE transport failure',
  async ({
    page,
  }, testInfo) => {
    const allRequests:
      Request[] = []

    const streamRequests:
      Request[] = []


    page.on(
      'request',
      (request) => {
        allRequests.push(
          request,
        )

        if (
          pathOf(request)
            .includes('/runs/') &&
          pathOf(request)
            .endsWith('/stream')
        ) {
          streamRequests.push(
            request,
          )
        }
      },
    )


    /*
     * Install transport fault injection before application
     * JavaScript executes.
     *
     * Production source remains completely unchanged.
     */
    await page.addInitScript(
      () => {
        type FaultScope =
          typeof globalThis & {
            __maslFailInitialRunStream?:
              () => boolean
          }


        const scope =
          globalThis as
            FaultScope

        const originalFetch =
          scope.fetch.bind(
            scope,
          )


        let wrapped =
          false

        let failed =
          false

        let upstreamReader:
          ReadableStreamDefaultReader<
            Uint8Array
          > | null =
            null

        let downstreamController:
          ReadableStreamDefaultController<
            Uint8Array
          > | null =
            null


        scope.__maslFailInitialRunStream =
          () => {
            if (
              failed ||
              upstreamReader ===
                null ||
              downstreamController ===
                null
            ) {
              return false
            }

            failed =
              true

            /*
             * Stop consuming the original HTTP body so the
             * browser tears down that stream.
             */
            void upstreamReader
              .cancel(
                'Playwright simulated SSE transport failure',
              )
              .catch(() => {
                // The underlying transport may already be gone.
              })

            /*
             * Surface a browser-style transport failure to the
             * application instead of an intentional AbortError.
             */
            try {
              downstreamController.error(
                new TypeError(
                  'Playwright simulated network stream failure',
                ),
              )
            } catch {
              // Stream may already have transitioned terminal.
            }

            return true
          }


        scope.fetch =
          async (
            input,
            init,
          ) => {
            const requestUrl =
              typeof input ===
                'string'
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url

            const requestMethod =
              (
                init?.method ??
                (
                  input instanceof
                    Request
                    ? input.method
                    : 'GET'
                )
              ).toUpperCase()

            const url =
              new URL(
                requestUrl,
                scope.location.href,
              )


            if (
              wrapped ||
              requestMethod !==
                'POST' ||
              !/^\/threads\/[^/]+\/runs\/stream$/.test(
                url.pathname,
              )
            ) {
              return originalFetch(
                input,
                init,
              )
            }


            wrapped =
              true

            const response =
              await originalFetch(
                input,
                init,
              )


            if (
              response.body ===
              null
            ) {
              return response
            }


            upstreamReader =
              response.body
                .getReader()


            const wrappedBody =
              new ReadableStream<
                Uint8Array
              >({
                start(
                  controller,
                ) {
                  downstreamController =
                    controller
                },

                async pull(
                  controller,
                ) {
                  if (failed) {
                    return
                  }

                  const {
                    done,
                    value,
                  } =
                    await upstreamReader!
                      .read()

                  if (failed) {
                    return
                  }

                  if (done) {
                    downstreamController =
                      null

                    controller.close()

                    return
                  }

                  controller.enqueue(
                    value,
                  )
                },

                async cancel(
                  reason,
                ) {
                  downstreamController =
                    null

                  if (
                    upstreamReader !==
                    null
                  ) {
                    await upstreamReader
                      .cancel(
                        reason,
                      )
                  }
                },
              })


            return new Response(
              wrappedBody,
              {
                status:
                  response.status,

                statusText:
                  response.statusText,

                headers:
                  response.headers,
              },
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


    await expect(
      page.getByLabel(
        'Assistant',
      ),
    ).toBeEnabled()


    await userInput.fill(
      [
        'Write at least 80 lines.',
        'Every line must have the form:',
        'PW_RECONNECT_NNN — automated resumable stream verification',
        'where NNN starts at 001 and increases sequentially.',
        'Do not use markdown or add an introduction.',
      ].join('\n'),
    )


    const initialPostPromise =
      page.waitForRequest(
        (request) =>
          request.method() ===
            'POST' &&
          initialStreamPath.test(
            pathOf(request),
          ),
      )


    await createRun.click()


    await initialPostPromise


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


    const assistantMessage =
      page.locator(
        '.message[data-role="assistant"]',
      ).last()


    /*
     * Wait until model streaming has genuinely started.
     *
     * At this point metadata.run_id has already established
     * browser-side Runtime identity even though Location is
     * hidden by CORS.
     */
    await expect(
      assistantMessage,
    ).toContainText(
      'PW_RECONNECT_005',
      {
        timeout:
          90_000,
      },
    )


    const reconnectRequestPromise =
      page.waitForRequest(
        (request) =>
          request.method() ===
            'GET' &&
          resumedStreamPath.test(
            pathOf(request),
          ),
        {
          timeout:
            90_000,
        },
      )


    const faultInjected =
      await page.evaluate(
        () => {
          const scope =
            globalThis as
              typeof globalThis & {
                __maslFailInitialRunStream?:
                  () => boolean
              }

          return (
            scope
              .__maslFailInitialRunStream
              ?.() ??
            false
          )
        },
      )


    expect(
      faultInjected,
    ).toBe(true)


    await expect(
      phase,
    ).toHaveAttribute(
      'data-phase',
      'reconnecting-stream',
      {
        timeout:
          10_000,
      },
    )


    const reconnectRequest =
      await reconnectRequestPromise

    const reconnectPath =
      pathOf(
        reconnectRequest,
      )

    const reconnectMatch =
      resumedStreamPath.exec(
        reconnectPath,
      )


    expect(
      reconnectMatch,
    ).not.toBeNull()


    const threadId =
      reconnectMatch![1]

    const runId =
      reconnectMatch![2]


    const lastEventId =
      await reconnectRequest
        .headerValue(
          'last-event-id',
        )


    expect(
      lastEventId,
    ).not.toBeNull()

    expect(
      lastEventId,
    ).not.toBe('')


    await expect(
      phase,
    ).toHaveAttribute(
      'data-phase',
      'completed',
      {
        timeout:
          150_000,
      },
    )


    const runStatus =
      page
        .locator(
          '.execution-facts article',
        )
        .filter({
          hasText:
            'Run status',
        })
        .locator(
          'strong',
        )

    const graphNext =
      page
        .locator(
          '.execution-facts article',
        )
        .filter({
          hasText:
            'Graph next',
        })
        .locator(
          'strong',
        )


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


    /*
     * Replay must not create duplicate Assistant cards.
     */
    await expect(
      page.locator(
        '.message[data-role="assistant"]',
      ),
    ).toHaveCount(1)


    const finalAssistantText =
      await assistantMessage
        .textContent()


    expect(
      (
        finalAssistantText
          ?.match(
            /PW_RECONNECT_001/g,
          ) ??
        []
      ).length,
    ).toBe(1)


    /*
     * Exactly one POST creates the Runtime execution.
     */
    const creationPosts =
      streamRequests.filter(
        (request) =>
          request.method() ===
            'POST' &&
          initialStreamPath.test(
            pathOf(request),
          ),
      )


    expect(
      creationPosts,
    ).toHaveLength(1)


    /*
     * Reconnects must always be GETs against an existing Run.
     */
    const reconnectGets =
      streamRequests.filter(
        (request) =>
          request.method() ===
            'GET' &&
          resumedStreamPath.test(
            pathOf(request),
          ),
      )


    expect(
      reconnectGets.length,
    ).toBeGreaterThanOrEqual(1)


    /*
     * Final lifecycle reconciliation must address the same Run
     * that appeared in the resumable-stream URL.
     */
    expect(
      allRequests.some(
        (request) =>
          request.method() ===
            'GET' &&
          pathOf(request) ===
            `/threads/${threadId}/runs/${runId}`,
      ),
    ).toBe(true)


    expect(
      allRequests.some(
        (request) =>
          request.method() ===
            'GET' &&
          pathOf(request) ===
            `/threads/${threadId}/state`,
      ),
    ).toBe(true)


    const streamEvidence =
      await Promise.all(
        streamRequests.map(
          async (
            request,
          ) => ({
            method:
              request.method(),

            path:
              pathOf(request),

            lastEventId:
              await request
                .headerValue(
                  'last-event-id',
                ),
          }),
        ),
      )


    await testInfo.attach(
      'resumable-stream-evidence',
      {
        body:
          JSON.stringify(
            {
              threadId,
              runId,
              lastEventId,
              streamRequests:
                streamEvidence,
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
        'resumable-stream-completed.png',
      )


    await page.screenshot({
      path:
        screenshotPath,

      fullPage:
        true,
    })


    await testInfo.attach(
      'completed-ui',
      {
        path:
          screenshotPath,

        contentType:
          'image/png',
      },
    )
  },
)
