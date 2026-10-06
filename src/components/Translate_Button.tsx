import type { ComponentPropsWithoutRef } from 'react'
import styled from '@emotion/styled'

type ButtonProps = ComponentPropsWithoutRef<'button'>

export default function Button({ type = 'button', ...props }: ButtonProps) {
  return <StyledButton type={type} {...props} />
}

const StyledButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 20px;
  border: 0;
  border-radius: 4px;
  background-color: #254b78;
  color: #fff;
  font-size: 24px;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`
