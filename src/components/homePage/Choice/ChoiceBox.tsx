import styled from "@emotion/styled";
import Talking from "@/assets/Main/Talking.svg";
import Hand from "@/assets/Main/Hand.svg";

const IMAGES = { Talking, Hand };

interface ChoiceBoxProps {
  before: "수어" | "음성";
  after: "수어" | "음성";
  img: "Talking" | "Hand";
}

export default function ChoiceBox({ before, after, img }: ChoiceBoxProps) {
  return (
    <Wrapper>
      <Change>
        {before} - {after}
      </Change>
      <img src={IMAGES[img]} alt="" />
      <Title>{before === "수어" ? "수어로" : "음성으로"} 말하기</Title>
      <English>
        {before == "수어" ? "Sign to Speech" : "Speech to Sign"}{" "}
      </English>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  padding: 36px 0;
  width: 320px;
  height: auto;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  align-self: stretch;
  border-radius: var(--radius-lg, 16px);
  border: 2px solid #21406a;
  background: #fff;
  cursor: pointer;
`;

const English = styled.div`
  color: #21406a;
  text-align: center;
  font-family: Pretendard;
  font-size: var(--typo-body-large, 18px);
  font-weight: 400;
  line-height: 1;
`;

const Change = styled.div`
  color: #21406a;
  text-align: center;
  font-family: Pretendard;
  font-size: var(--typo-body-large, 18px);
  font-weight: 600;
  line-height: 1;
  margin-bottom: 20px;
`;

const Title = styled.div`
  color: #21406a;
  font-family: Pretendard;
  font-size: var(--typo-heading-h1, 32px);
  font-weight: 700;
  line-height: 1;
  margin-top: 32px;
  margin-bottom: 4px;
`;
