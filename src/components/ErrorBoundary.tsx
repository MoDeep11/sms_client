import { Component, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import styled from "@emotion/styled";

function RenderErrorPage() {
  return (
    <Page>
      <h1>일시적인 오류가 발생했습니다</h1>
      <p>잠시 후 다시 시도해 주세요.</p>
      <Link to="/">홈으로 돌아가기</Link>
    </Page>
  );
}

const Page = styled.main`
  max-width: 960px;
  margin: 0 auto;
  padding: 64px 24px;
`;

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? <RenderErrorPage /> : this.props.children;
  }
}

export default function RoutedErrorBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const { pathname } = useLocation();

  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}
