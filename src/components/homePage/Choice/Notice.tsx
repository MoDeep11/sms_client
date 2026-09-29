import styled from "@emotion/styled";

interface NoticeProps {
  text: string;
}

export default function Notice({ text }: NoticeProps) {
  return <Text>{text}</Text>;
}

const Text = styled.div`
  color: var(--color-gray-600, #868e96);
  text-align: center;
  margin-top: 8px;

  /* body/body-small */
  font-family: Pretendard;
  font-size: var(--typo-body-small, 14px);
  font-style: normal;
  font-weight: 400;
  line-height: 150%; /* 21px */
`;
