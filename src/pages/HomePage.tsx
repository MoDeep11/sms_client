import styled from '@emotion/styled'

export default function HomePage() {
  return (
    <Page>
      <h1>수어·음성 소통 서비스</h1>
      <Description>수어와 음성을 텍스트로 연결하는 서비스를 준비하고 있습니다.</Description>
    </Page>
  )
}

const Page = styled.main`
  max-width: 960px;
  margin: 0 auto;
  padding: 64px 24px;
`

const Description = styled.p`
  color: ${({ theme }) => theme.colors.muted};
`
