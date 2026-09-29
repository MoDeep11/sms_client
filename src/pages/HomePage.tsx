import styled from "@emotion/styled";
import Header from "@/components/Header";
import ChoiceBoxList from "@/components/homePage/ChoiceBoxList";
import IsReady from "@/components/homePage/IsReady";
import NotFoundPage from "@/pages/NotFoundPage";

export default function HomePage() {
  try {
    return (
      <Page>
        <HeaderSlot>
          <Header />
        </HeaderSlot>
        <Center>
          <Title>통역을 시작할 방법을 선택해 주세요</Title>
          <ChoiceBoxList />
        </Center>
        <ReadySlot>
          <IsReady status="success" />
        </ReadySlot>
      </Page>
    );
  } catch {
    return <NotFoundPage />;
  }
}

const Page = styled.main`
  position: relative;
  display: flex;
  min-height: 100dvh;
`;

const HeaderSlot = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
`;

const ReadySlot = styled.div`
  position: fixed;
  right: 48px;
  bottom: 48px;
`;

const Center = styled.div`
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  width: 100%;
  margin-bottom: 6%;
`;

const Title = styled.div`
  color: #000;
  text-align: center;
  font-family: Pretendard;
  font-size: var(--typo-heading-h1, 32px);
  font-style: normal;
  font-weight: 700;
  line-height: 120%; /* 38.4px */
  align-self: stretch;
  margin-bottom: 48px;
`;
