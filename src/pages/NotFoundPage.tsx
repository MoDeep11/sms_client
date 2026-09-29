import styled from '@emotion/styled'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <Page>
      <h1>페이지를 찾을 수 없습니다</h1>
      <Link to="/">홈으로 돌아가기</Link>
    </Page>
  )
}

const Page = styled.main`
  max-width: 960px;
  margin: 0 auto;
  padding: 64px 24px;
`
