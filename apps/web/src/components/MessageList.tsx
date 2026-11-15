import type { Message } from '../domain'
import { projectMessagesForDisplay } from '../execution/message-display'

/**
 * Display boundary only: tool contents and structured blocks are withheld.
 * Human/model-authored plain text is NOT automatically secret-free.
 */
export function MessageList({
  messages,
}: {
  readonly messages: readonly Message[]
}) {
  const display = projectMessagesForDisplay(messages)

  if (display.length === 0) {
    return (
      <div className="message-empty">
        No persisted messages in this Thread.
      </div>
    )
  }

  return (
    <div className="message-list">
      {display.map((message, index) => (
        <article
          className="message"
          data-role={message.role}
          key={message.id ?? `${message.role}-${index}`}
        >
          <header>
            <strong>{message.role}</strong>
          </header>
          <div className="message-content">
            {message.blocks.map((block, blockIndex) => (
              <pre key={blockIndex} data-content-redacted={block.redacted ? 'true' : 'false'}>
                {block.text}
              </pre>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}
