import type {
  Message,
  MessageContentBlock,
} from '../domain'

const blockText = (
  block: MessageContentBlock,
): string => {
  if (block.kind === 'text') {
    return block.text
  }

  try {
    return JSON.stringify(
      block.data,
      null,
      2,
    )
  } catch {
    return String(
      block.data,
    )
  }
}

export function MessageList({
  messages,
}: {
  readonly messages:
    readonly Message[]
}) {
  if (messages.length === 0) {
    return (
      <div className="message-empty">
        No persisted messages in this Thread.
      </div>
    )
  }

  return (
    <div className="message-list">
      {messages.map(
        (message, index) => (
          <article
            className="message"
            data-role={message.role}
            key={
              message.id ??
              `${message.role}-${index}`
            }
          >
            <header>
              <strong>
                {message.role}
              </strong>

              {message.name !== null && (
                <span>
                  {message.name}
                </span>
              )}
            </header>

            <div className="message-content">
              {message.content.map(
                (block, blockIndex) => (
                  <pre
                    key={blockIndex}
                  >
                    {blockText(block)}
                  </pre>
                ),
              )}
            </div>
          </article>
        ),
      )}
    </div>
  )
}
