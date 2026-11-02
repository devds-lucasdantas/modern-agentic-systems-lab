import {
  expect,
  test,
} from '@playwright/test'


const runtimeOrigin =
  'http://127.0.0.1:2024'


const pathOf = (
  value: string,
): string =>
  new URL(
    value,
  ).pathname


const streamCreationPath =
  /^\/threads\/([^/]+)\/runs\/stream$/


const streamLocationPath =
  /^\/threads\/([^/]+)\/runs\/([^/]+)(?:\/stream)?$/


test(
  'reconciles an interrupted Run exactly to persisted ThreadState',
  async ({
    page,
    request,
  }, testInfo) => {
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
      page.locator(
        '.message[data-role="assistant"] .message-content pre',
      ).first()


    /*
     * Capture the raw initial POST response.
     *
     * Playwright can inspect transport headers independently of
     * the browser application's CORS-visible Headers object.
     */
    const streamResponsePromise =
      page.waitForResponse(
        (response) =>
          response
            .request()
            .method() ===
            'POST' &&
          streamCreationPath.test(
            pathOf(
              response.url(),
            ),
          ),
        {
          timeout:
            30_000,
        },
      )


    await userInput.fill(
      [
        'Write exactly 300 lines.',
        'Each line must have the form:',
        'INTERRUPTED_NNN — persisted reconciliation verification',
        'where NNN runs from 001 to 300.',
        'Do not use markdown or add explanation.',
      ].join('\n'),
    )


    await createRun.click()


    const streamResponse =
      await streamResponsePromise


    const location =
      (
        await streamResponse
          .headerValue(
            'location',
          )
      ) ??
      (
        await streamResponse
          .headerValue(
            'content-location',
          )
      )


    expect(
      location,
      'Runtime must expose Run identity to Playwright transport inspection',
    ).not.toBeNull()


    const locationUrl =
      new URL(
        location!,
        runtimeOrigin,
      )


    const identity =
      streamLocationPath.exec(
        locationUrl.pathname,
      )


    expect(
      identity,
    ).not.toBeNull()


    const threadId =
      identity![1]

    const runId =
      identity![2]


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
     * Wait for genuine provisional model output.
     *
     * Cancelling here ensures that we are testing replacement of
     * an already-rendered live snapshot, not an empty Run.
     */
    await expect(
      assistantContent,
    ).toContainText(
      'INTERRUPTED_005',
      {
        timeout:
          90_000,
      },
    )


    await expect(
      messageAuthority,
    ).toHaveText(
      'live',
    )


    const provisionalText =
      await assistantContent
        .textContent()


    expect(
      provisionalText,
    ).not.toBeNull()

    expect(
      provisionalText!.length,
    ).toBeGreaterThan(0)


    const beforeCancelScreenshot =
      testInfo.outputPath(
        'interrupted-live-projection.png',
      )


    await page.screenshot({
      path:
        beforeCancelScreenshot,

      fullPage:
        true,
    })


    /*
     * Explicit Runtime lifecycle cancellation.
     *
     * This is not a transport disconnect and is not a graph/HITL
     * interrupt().
     */
    const cancelResponse =
      await request.post(
        `${runtimeOrigin}/threads/${encodeURIComponent(
          threadId!,
        )}/runs/${encodeURIComponent(
          runId!,
        )}/cancel`,
        {
          params: {
            action:
              'interrupt',

            wait:
              'true',
          },
        },
      )


    expect(
      cancelResponse.ok(),
      `cancel failed: ${cancelResponse.status()}`,
    ).toBe(true)


    /*
     * The frontend should consume stream termination, reconcile
     * the lifecycle resource, then fetch persisted ThreadState.
     */
    await expect(
      phase,
    ).toHaveAttribute(
      'data-phase',
      'completed',
      {
        timeout:
          60_000,
      },
    )


    await expect(
      runStatus,
    ).toHaveText(
      'interrupted',
    )


    /*
     * Persisted state should exist even though execution did not
     * reach normal graph completion.
     *
     * We deliberately do NOT assert END here. Run lifecycle and
     * graph position are independent.
     */
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
     * Read persisted Runtime authority before deciding how many
     * Assistant cards may survive reconciliation.
     *
     * A streamed messages/partial event is only provisional.
     *
     * If lifecycle interruption happens before the model node
     * commits an AIMessage, persisted ThreadState can correctly
     * contain zero AI messages even though partial output was
     * already visible in the browser.
     */
    const persistedResponse =
      await request.get(
        `${runtimeOrigin}/threads/${encodeURIComponent(
          threadId!,
        )}/state`,
      )


    expect(
      persistedResponse.ok(),
    ).toBe(true)


    const persisted =
      await persistedResponse.json()


    const values =
      persisted?.values


    expect(
      values,
    ).toBeTruthy()


    expect(
      Array.isArray(
        values.messages,
      ),
    ).toBe(true)


    const persistedAiMessages =
      values.messages.filter(
        (
          message: unknown,
        ) =>
          typeof message ===
            'object' &&
          message !== null &&
          (
            message as {
              type?: unknown
            }
          ).type ===
            'ai',
      )


    const persistedAssistantTexts =
      persistedAiMessages.map(
        (
          message: unknown,
        ) => {
          const content =
            (
              message as {
                content?: unknown
              }
            ).content

          expect(
            typeof content,
          ).toBe(
            'string',
          )

          return content as string
        },
      )


    /*
     * This is the main interrupted-reconciliation invariant.
     *
     * Final UI cardinality is dictated by persisted
     * ThreadState, not by the provisional stream.
     */
    await expect(
      assistantCards,
    ).toHaveCount(
      persistedAssistantTexts.length,
    )


    for (
      let index = 0;
      index <
      persistedAssistantTexts.length;
      index += 1
    ) {
      await expect(
        assistantCards
          .nth(index)
          .locator(
            '.message-content pre',
          )
          .first(),
      ).toHaveText(
        persistedAssistantTexts[
          index
        ]!,
      )
    }


    const reconciledAssistantTexts:
      string[] = []


    for (
      let index = 0;
      index <
      persistedAssistantTexts.length;
      index += 1
    ) {
      reconciledAssistantTexts.push(
        (
          await assistantCards
            .nth(index)
            .locator(
              '.message-content pre',
            )
            .first()
            .textContent()
        ) ??
        '',
      )
    }


    expect(
      reconciledAssistantTexts,
    ).toEqual(
      persistedAssistantTexts,
    )


    /*
     * A particularly valuable case is:
     *
     * provisional AI output existed
     * persisted AI messages = 0
     *
     * In that case reconciliation must deliberately remove the
     * transient Assistant card.
     */
    const provisionalWasDiscarded =
      provisionalText !== null &&
      provisionalText.length > 0 &&
      persistedAssistantTexts.length ===
        0


    const persistedGraphNext =
      Array.isArray(
        persisted.next,
      )
        ? persisted.next
        : []


    const persistedCheckpoint =
      persisted.checkpoint ??
      null


    await testInfo.attach(
      'interrupted-reconciliation-evidence',
      {
        body:
          JSON.stringify(
            {
              threadId,
              runId,

              lifecycle:
                'interrupted',

              provisional: {
                length:
                  provisionalText!
                    .length,

                prefix:
                  provisionalText!
                    .slice(
                      0,
                      200,
                    ),
              },

              persisted: {
                assistantCount:
                  persistedAssistantTexts.length,

                assistants:
                  persistedAiMessages.map(
                    (
                      message: unknown,
                      index: number,
                    ) => ({
                      id:
                        (
                          message as {
                            id?: unknown
                          }
                        ).id ??
                        null,

                      length:
                        persistedAssistantTexts[
                          index
                        ]?.length ??
                        0,

                      prefix:
                        persistedAssistantTexts[
                          index
                        ]?.slice(
                          0,
                          200,
                        ) ??
                        '',
                    }),
                  ),

                graphNext:
                  persistedGraphNext,

                checkpoint:
                  persistedCheckpoint,
              },

              reconciliation: {
                uiAssistantCount:
                  reconciledAssistantTexts.length,

                persistedAssistantCount:
                  persistedAssistantTexts.length,

                uiEqualsPersisted:
                  JSON.stringify(
                    reconciledAssistantTexts,
                  ) ===
                  JSON.stringify(
                    persistedAssistantTexts,
                  ),

                provisionalWasDiscarded,
              },
            },
            null,
            2,
          ),

        contentType:
          'application/json',
      },
    )


    const finalScreenshot =
      testInfo.outputPath(
        'interrupted-reconciled.png',
      )


    await page.screenshot({
      path:
        finalScreenshot,

      fullPage:
        true,
    })


    await testInfo.attach(
      'interrupted-reconciled-ui',
      {
        path:
          finalScreenshot,

        contentType:
          'image/png',
      },
    )
  },
)
