# Current checkpoint

The repository has been rebuilt under the name `modern-agentic-systems-lab`.

## Completed

- repository/bootstrap and Git concepts;
- WSL/environment preflight;
- official Interrupt 2026 Deep Agents workshop pinned to commit
  `3d3287cf1e51250934c11aff182d90ccfaf0e66d`;
- project contract inspection;
- LangChain / Deep Agents / LangGraph boundary mapping;
- lockfile, skill and notebook static inspection;
- `uv sync --locked` dependency analysis;
- runtime validation;
- discovery of the Zsh secret-input portability issue and diagnostic false
  positive for empty API keys.

## Next

Continue with **0.3 Minimal Deep Agent**.

The external workshop clone is intentionally not embedded in the ZIP. It is
ignored by the learning repository and can be restored at the pinned upstream
commit with:

~~~bash
./scripts/bootstrap-reference.sh
cd .reference/interrupt26-deepagents
uv sync --locked
~~~

`.venv` and `.env` are intentionally omitted. This keeps the archive compact and
avoids bundling machine-specific environments or credentials.

Then configure non-empty `OPENAI_API_KEY` and `TAVILY_API_KEY` locally without
committing or sharing them.
