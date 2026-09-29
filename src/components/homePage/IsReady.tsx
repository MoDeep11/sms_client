import styled from "@emotion/styled";

interface IsReadyProps {
  status: "error" | "success";
}

export default function IsReady({ status }: IsReadyProps) {
  return (
    <Wrapper color={status == "error" ? "#E54D4D" : "#20AF61"}>
      <Dot />
      <Text>
        {status == "error"
          ? "카메라·마이크 권한 필요"
          : "카메라·마이크 준비 완료"}
      </Text>
    </Wrapper>
  );
}

const Wrapper = styled.div<{ color: string }>`
  display: flex;
  padding: var(--space-6, 6px) var(--space-20, 20px);
  justify-content: center;
  align-items: center;
  gap: 10px;
  border-radius: var(--radius-full, 999999px);
  color: ${({ color }) => color};
  border: 1px solid currentColor;
  background: color-mix(in srgb, currentColor 20%, transparent);
  height: 38px;
  box-sizing: border-box;
`;

const Dot = styled.div`
  width: 6px;
  height: 6px;
  aspect-ratio: 1/1;
  border-radius: var(--radius-full, 999999px);
  background: currentColor;
`;

const Text = styled.div`
  text-align: center;
  font-family: Pretendard;
  font-size: var(--typo-body-medium, 16px);
  font-style: normal;
  font-weight: 400;
  line-height: 150%; /* 24px */
  margin-bottom: -3px;
`;
