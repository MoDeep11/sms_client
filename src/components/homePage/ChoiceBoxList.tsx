import styled from "@emotion/styled";
import ChoiceBox from "./Choice/ChoiceBox";
import Notice from "./Choice/Notice";

export default function ChoiceBoxList() {
  return (
    <Wrapper>
      <BoxWrapper>
        <ChoiceBox before="음성" after="수어" img="Talking" />
        <Notice text="음성으로 말하기, 내 말이 수어로 전달돼요" />
      </BoxWrapper>

      <BoxWrapper>
        <ChoiceBox before="수어" after="음성" img="Hand" />
        <Notice text="수어로 말하기, 내 수어가 음성으로 전달돼요" />
      </BoxWrapper>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 48px;
`;

const BoxWrapper = styled.div``;
