import { Modal, Button, Space, theme } from 'antd';
import { useEffect, useState } from 'react';

interface AnnouncementModalProps {
  visible: boolean;
  onClose: () => void;
  onDoNotShowToday: () => void;
  onNeverShow: () => void;
}

export default function AnnouncementModal({ visible, onClose, onDoNotShowToday, onNeverShow }: AnnouncementModalProps) {
  const [qqImageError, setQqImageError] = useState(false);
  const [wxImageError, setWxImageError] = useState(false);
  const { token } = theme.useToken();
  const alphaColor = (color: string, alpha: number) => `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(0)}%, transparent)`;

  useEffect(() => {
    if (visible) {
      setQqImageError(false);
      setWxImageError(false);
    }
  }, [visible]);

  const handleDoNotShowToday = () => {
    onDoNotShowToday();
    onClose();
  };

  const handleNeverShow = () => {
    onNeverShow();
    onClose();
  };

  return (
    <Modal
      title={
        <div style={{
          fontSize: '20px',
          fontWeight: 600,
          color: token.colorPrimary,
          textAlign: 'center',
        }}>
          🎉 Welcome to the AI Novel Creation Assistant
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={
        <Space style={{ width: '100%', justifyContent: 'center' }}>
          <Button
            onClick={handleDoNotShowToday}
            size="large"
            style={{
              borderRadius: '8px',
              height: '40px',
              fontSize: '14px',
            }}
          >
            Don’t show for today
          </Button>
          <Button
            type="primary"
            onClick={handleNeverShow}
            size="large"
            style={{
              borderRadius: '8px',
              height: '40px',
              fontSize: '14px',
              background: token.colorPrimary,
              borderColor: token.colorPrimary,
              boxShadow: `0 8px 20px ${alphaColor(token.colorPrimary, 0.32)}`,
            }}
          >
            Never show again
          </Button>
        </Space>
      }
      width={700}
      centered
      styles={{
        body: {
          padding: '20px',
          background: token.colorBgContainer,
        },
        header: {
          background: `linear-gradient(135deg, ${alphaColor(token.colorPrimary, 0.1)} 0%, ${alphaColor(token.colorBgContainer, 0.98)} 100%)`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          padding: '16px 24px',
        },
        footer: {
          background: token.colorBgContainer,
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          padding: '16px 24px',
        },
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{
          marginBottom: '12px',
          fontSize: '15px',
          color: token.colorTextSecondary,
          lineHeight: '1.5',
        }}>
          <p style={{ marginBottom: '8px' }}>👋 Welcome to our creator community! Here you can:</p>
          <ul style={{
            textAlign: 'left',
            marginLeft: '40px',
            marginTop: '0',
            marginBottom: '12px',
          }}>
            <li>💬 Exchange ideas and inspiration with other creators</li>
            <li>💡 Get the latest feature updates and practical tips</li>
            <li>🐛 Share bugs, issues, and feedback</li>
            <li>📚 Exchange writing experience and creative ideas</li>
          </ul>
          <p style={{ fontWeight: 600, color: token.colorText, marginBottom: '12px' }}>
            Scan the QR code below to join the community:
          </p>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: '24px',
          padding: '16px',
          background: token.colorBgLayout,
          borderRadius: '8px',
          flexWrap: 'wrap',
        }}>
          {/* QQ 二维码 */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: '200px',
          }}>
            <p style={{ fontWeight: 600, color: token.colorText, marginBottom: '8px', fontSize: '14px' }}>
              QQ Community
            </p>
            {!qqImageError ? (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: token.colorBgContainer,
                borderRadius: '8px',
                padding: '6px',
                boxShadow: `0 2px 8px ${alphaColor(token.colorText, 0.12)}`,
              }}>
                <img
                  src="/qq.jpg"
                  alt="QQ community QR code"
                  style={{
                    maxWidth: '180px',
                    maxHeight: '180px',
                    width: 'auto',
                    height: 'auto',
                    display: 'block',
                    objectFit: 'contain',
                  }}
                  onError={() => setQqImageError(true)}
                />
              </div>
            ) : (
              <div style={{
                width: '180px',
                height: '180px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: token.colorBgContainer,
                borderRadius: '8px',
                color: token.colorTextTertiary,
              }}>
                <p>Failed to load QR code</p>
              </div>
            )}
          </div>

          {/* 微信二维码 */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: '200px',
          }}>
            <p style={{ fontWeight: 600, color: token.colorText, marginBottom: '8px', fontSize: '14px' }}>
              WeChat Community
            </p>
            {!wxImageError ? (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: token.colorBgContainer,
                borderRadius: '8px',
                padding: '6px',
                boxShadow: `0 2px 8px ${alphaColor(token.colorText, 0.12)}`,
              }}>
                <img
                  src="/WX.png"
                  alt="WeChat community QR code"
                  style={{
                    maxWidth: '180px',
                    maxHeight: '180px',
                    width: 'auto',
                    height: 'auto',
                    display: 'block',
                    objectFit: 'contain',
                  }}
                  onError={() => setWxImageError(true)}
                />
              </div>
            ) : (
              <div style={{
                width: '180px',
                height: '180px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: token.colorBgContainer,
                borderRadius: '8px',
                color: token.colorTextTertiary,
              }}>
                <p>Failed to load QR code</p>
              </div>
            )}
          </div>
        </div>

        <div style={{
          marginTop: '16px',
          padding: '10px',
          background: token.colorWarningBg,
          borderRadius: '8px',
          border: `1px solid ${token.colorWarningBorder}`,
          fontSize: '13px',
          color: token.colorWarning,
        }}>
          💡 Tip: choosing "Don’t show for today" hides this announcement for the rest of the day, while choosing "Never show again" hides it permanently.
        </div>
      </div>
    </Modal>
  );
}