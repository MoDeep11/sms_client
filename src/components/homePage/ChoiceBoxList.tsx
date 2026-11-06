import styled from "@emotion/styled";
import ChoiceBox from "./Choice/ChoiceBox";
import Notice from "./Choice/Notice";

export default function ChoiceBoxList() {
  return (
    <Wrapper>
      <BoxWrapper>
        <ChoiceBox before="음성" after="텍스트" img="Talking" />
        <Notice text="음성으로 말하기, 내 말을 텍스트로 전달해요" />
      </BoxWrapper>

      <BoxWrapper>
        <ChoiceBox before="수어" after="텍스트" img="Hand" />
        <Notice text="수어로 말하기, 내 수어를 텍스트로 전달해요" />
      </BoxWrapper>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  box-sizing: border-box;
  padding: 0 16px;
  justify-content: center;
  align-items: center;
  gap: 48px;
`;

const BoxWrapper = styled.div`
  flex: 0 1 320px;
  min-width: 0;
`;
