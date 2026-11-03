import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@emotion/react";
import App from "@/App";
import NotFoundPage from "@/pages/NotFoundPage";
import GlobalStyles from "@/styles/GlobalStyles";
import { theme } from "@/styles/theme";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? <NotFoundPage /> : this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
