import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@emotion/react";
import App from "@/App";
import RoutedErrorBoundary from "@/components/ErrorBoundary";
import GlobalStyles from "@/styles/GlobalStyles";
import { theme } from "@/styles/theme";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <BrowserRouter>
        <RoutedErrorBoundary>
          <App />
        </RoutedErrorBoundary>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
