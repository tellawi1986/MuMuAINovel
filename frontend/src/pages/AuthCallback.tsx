import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Result, Button, Modal, Input, message, theme } from 'antd';
import { authApi } from '../services/api';
import AnnouncementModal from '../components/AnnouncementModal';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const { token } = theme.useToken();
  const alphaColor = (color: string, alpha: number) => `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(0)}%, transparent)`;
  interface PasswordStatus {
    has_password: boolean;
    has_custom_password: boolean;
    username: string;
    default_password: string;
  }
  const [passwordStatus, setPasswordStatus] = useState<PasswordStatus | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // The backend sets auth information automatically via cookie.
        // We only need to verify the current login state here.
        const currentUser = await authApi.getCurrentUser();

        // Check whether this is the user's first login via a cookie flag.
        const isFirstLogin = document.cookie.includes('first_login=true');
        
        setStatus('success');

        if (isFirstLogin) {
          // First login: generate a default password and show a prompt.
          const defaultPassword = `${currentUser.username}@666`;
          const pwdStatus = {
            has_password: false,
            has_custom_password: false,
            username: currentUser.username,
            default_password: defaultPassword
          };
          setPasswordStatus(pwdStatus);

          // Clear the first-login cookie flag.
          document.cookie = 'first_login=; path=/; max-age=0';

          // Show the password initialization modal.
          setTimeout(() => {
            setShowPasswordModal(true);
          }, 1000);
          return;
        }

        // Not the first login: normal flow.
        // Read the redirect target from sessionStorage.
        const redirect = sessionStorage.getItem('login_redirect') || '/';
        sessionStorage.removeItem('login_redirect');

        // Check whether the announcement is permanently hidden or already hidden today.
        const hideForever = localStorage.getItem('announcement_hide_forever');
        const hideToday = localStorage.getItem('announcement_hide_today');
        const today = new Date().toDateString();

        if (hideForever === 'true' || hideToday === today) {
          // Delay slightly so the user sees the success state first.
          setTimeout(() => {
            navigate(redirect);
          }, 1000);
        } else {
          // Delay slightly so the user sees the success state before the announcement appears.
          setTimeout(() => {
            setShowAnnouncement(true);
          }, 1000);
        }
      } catch (error) {
        console.error('Sign-in failed:', error);
        setStatus('error');
        setErrorMessage('Sign-in failed. Please try again.');
      }
    };

    handleCallback();
  }, [navigate]);

  if (status === 'loading') {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorPrimaryHover} 100%)`,
      }}>
        <div style={{ textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 20, color: token.colorWhite, fontSize: 16 }}>
            Processing sign-in...
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorPrimaryHover} 100%)`,
      }}>
        <Result
          status="error"
          title="Sign-in failed"
          subTitle={errorMessage}
          extra={
            <Button type="primary" onClick={() => navigate('/login')}>
              Back to sign-in
            </Button>
          }
          style={{ background: token.colorBgContainer, padding: 40, borderRadius: 8 }}
        />
      </div>
    );
  }

  const handleAnnouncementClose = () => {
    setShowAnnouncement(false);
    const redirect = sessionStorage.getItem('login_redirect') || '/';
    sessionStorage.removeItem('login_redirect');
    navigate(redirect);
  };

  const handleDoNotShowToday = () => {
    // Hide announcements for today.
    const today = new Date().toDateString();
    localStorage.setItem('announcement_hide_today', today);
  };

  const handleNeverShow = () => {
    // Hide announcements permanently.
    localStorage.setItem('announcement_hide_forever', 'true');
  };

  const handleSetPassword = async () => {
    // If no new password is entered, use the default password.
    const passwordToSet = newPassword || passwordStatus?.default_password;
    
    if (!passwordToSet) {
      message.error('Please enter a new password');
      return;
    }
    if (passwordToSet.length < 6) {
      message.error('Password must be at least 6 characters long');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      message.error('The two passwords do not match');
      return;
    }

    setSettingPassword(true);
    try {
      // First login uses the initialize endpoint; later changes use the update endpoint.
      const isFirstLogin = !passwordStatus?.has_password;
      if (isFirstLogin) {
        await authApi.initializePassword(passwordToSet);
        message.success('Password initialized successfully');
      } else {
        await authApi.setPassword(passwordToSet);
        message.success('Password set successfully');
      }
      setShowPasswordModal(false);

      // Continue the rest of the flow.
      const redirect = sessionStorage.getItem('login_redirect') || '/';
      sessionStorage.removeItem('login_redirect');

      const hideForever = localStorage.getItem('announcement_hide_forever');
      const hideToday = localStorage.getItem('announcement_hide_today');
      const today = new Date().toDateString();

      if (hideForever === 'true' || hideToday === today) {
        setTimeout(() => {
          navigate(redirect);
        }, 500);
      } else {
        setTimeout(() => {
          setShowAnnouncement(true);
        }, 500);
      }
    } catch {
      message.error('Failed to set password. Please try again.');
    } finally {
      setSettingPassword(false);
    }
  };

  const handleSkipPasswordSetting = async () => {
    // On first login, if skipped, initialize the default password.
    const isFirstLogin = !passwordStatus?.has_password;
    if (isFirstLogin && passwordStatus?.default_password) {
      try {
        await authApi.initializePassword(passwordStatus.default_password);
      } catch (error) {
        console.error('Failed to initialize default password:', error);
      }
    }

    setShowPasswordModal(false);

    // Continue the rest of the flow.
    const redirect = sessionStorage.getItem('login_redirect') || '/';
    sessionStorage.removeItem('login_redirect');

    const hideForever = localStorage.getItem('announcement_hide_forever');
    const hideToday = localStorage.getItem('announcement_hide_today');
    const today = new Date().toDateString();

    if (hideForever === 'true' || hideToday === today) {
      setTimeout(() => {
        navigate(redirect);
      }, 500);
    } else {
      setTimeout(() => {
        setShowAnnouncement(true);
      }, 500);
    }
  };

  return (
    <>
      <AnnouncementModal
        visible={showAnnouncement}
        onClose={handleAnnouncementClose}
        onDoNotShowToday={handleDoNotShowToday}
        onNeverShow={handleNeverShow}
      />

      <Modal
        title="Set account password"
        open={showPasswordModal}
        centered
        onOk={handleSetPassword}
        onCancel={handleSkipPasswordSetting}
        confirmLoading={settingPassword}
        okText="Set password"
        cancelText="Skip for now"
        width={500}
      >
        <div style={{ marginBottom: 20 }}>
          <p>You have successfully signed in with Linux DO.</p>
          <p>The system generated a default password for you. You can set a custom password or continue using the default one.</p>
          {passwordStatus?.default_password && (
            <div style={{
              background: token.colorFillTertiary,
              padding: 12,
              borderRadius: 4,
              marginTop: 12
            }}>
              <strong>Username:</strong>{passwordStatus.username}<br />
              <strong>Default password:</strong><code style={{
                background: token.colorBgContainer,
                padding: '2px 8px',
                borderRadius: 3,
                color: token.colorPrimary,
                fontSize: 14
              }}>{passwordStatus.default_password}</code>
            </div>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <label>New password (at least 6 characters):</label>
            <Input.Password
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Please enter a new password"
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <label>Confirm password:</label>
            <Input.Password
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Please re-enter your password"
              style={{ marginTop: 4 }}
            />
          </div>
        </div>
      </Modal>

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorPrimaryHover} 100%)`,
      }}>
        <Result
          status="success"
          title="Sign-in successful"
          subTitle={showPasswordModal ? "Set your account password..." : (showAnnouncement ? "Welcome..." : "Redirecting...")}
          style={{ background: alphaColor(token.colorBgContainer, 0.96), padding: 40, borderRadius: 8 }}
        />
      </div>
    </>
  );
}