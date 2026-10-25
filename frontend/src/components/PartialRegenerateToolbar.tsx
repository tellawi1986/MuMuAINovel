import React from 'react';
import { Button, Tooltip, theme } from 'antd';
import { EditOutlined } from '@ant-design/icons';

interface PartialRegenerateToolbarProps {
  visible: boolean;
  position: { top: number; left: number };
  onRegenerate: () => void;
  selectedText: string;
}

/**
 * Floating toolbar for partial rewrites
 * Displayed when the user selects text in the chapter editor
 */
export const PartialRegenerateToolbar: React.FC<PartialRegenerateToolbarProps> = ({
  visible,
  position,
  onRegenerate,
  selectedText
}) => {
  const { token } = theme.useToken();

  if (!visible || !selectedText) return null;

  // Limit displayed selected text length
  const displayText = selectedText.length > 20 
    ? selectedText.substring(0, 20) + '...' 
    : selectedText;

  return (
    <div
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 10000,
        background: token.colorBgElevated,
        borderRadius: 8,
        boxShadow: token.boxShadow,
        padding: '6px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        animation: 'fadeIn 0.2s ease-out',
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <Tooltip
        title={`AI rewrite selected text: "${displayText}"`}
        placement="top"
      >
        <Button
          type="primary"
          size="small"
          icon={<EditOutlined />}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRegenerate();
          }}
          style={{
            // Use the current Ant Design token to avoid CSS variable issues in light/dark mode.
            background: `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorPrimaryHover} 100%)`,
            color: token.colorTextLightSolid,
            borderColor: token.colorPrimary,
            fontWeight: 500,
            boxShadow: token.boxShadowSecondary,
          }}
        >
          AI Rewrite
        </Button>
      </Tooltip>
      <span style={{ 
        fontSize: 12, 
        color: token.colorTextTertiary,
        maxWidth: 150,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        Selected {selectedText.length} chars
      </span>
    </div>
  );
};

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
if (!document.head.querySelector('style[data-partial-regenerate-toolbar]')) {
  style.setAttribute('data-partial-regenerate-toolbar', 'true');
  document.head.appendChild(style);
}

export default PartialRegenerateToolbar;