import { Global, css, useTheme } from '@emotion/react'

export default function GlobalStyles() {
  const theme = useTheme()

  return (
    <Global
      styles={css`
        *, *::before, *::after { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 0;
          min-width: 320px;
          background: ${theme.colors.background};
          color: ${theme.colors.text};
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          line-height: 1.6;
        }
        #root { min-height: 100dvh; }
        button, input, textarea, select { font: inherit; }
        a { color: ${theme.colors.primary}; }
        :focus-visible { outline: 3px solid ${theme.colors.primary}; outline-offset: 4px; }
      `}
    />
  )
}
