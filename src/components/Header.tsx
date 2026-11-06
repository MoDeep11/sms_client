import Logo from "@/assets/Logo/White.svg";
import styled from "@emotion/styled";

export default function Header() {
  return (
    <Wrapper>
      <img src={Logo} alt="logo" />
    </Wrapper>
  );
}

const Wrapper = styled.div`
  background-color: #21406a;
  width: 100%;
  height: 56px;
  flex-shrink: 0;
  display: flex;
  padding: 12px 48px;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
`;
