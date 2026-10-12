import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useOnClickOutside } from '@/shared/hooks/useOnClickOutside';
import { ROUTES } from '@/app/constants/routes';

/**
 * ProfileMenu - User profile dropdown with navigation and sign out.
 * Matches the Airbnb-style design with avatar/initials.
 */
export function ProfileMenu(): JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(menuRef, () => setIsOpen(false));

  if (!user) {
    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Link to={ROUTES.LOGIN} className="chip" style={{ textDecoration: 'none' }}>
          Sign in
        </Link>
        <Link 
          to={ROUTES.REGISTER} 
          className="chip" 
          style={{ 
            background: 'var(--brand)', 
            color: 'white',
            borderColor: 'var(--brand)',
            textDecoration: 'none'
          }}
        >
          Sign up
        </Link>
      </div>
    );
  }

  // Get initials from user name or email
  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user.email[0].toUpperCase();

  const firstName = user.name?.split(' ')[0] || 'Account';

  const handleSignOut = () => {
    setIsOpen(false);
    logout();
    navigate(ROUTES.HOME);
  };

  return (
    <div className="rel" ref={menuRef}>
      <button
        className="chip u"
        id="um"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        type="button"
      >
        {user.avatar ? (
          <img 
            src={user.avatar} 
            alt={user.name || 'User'} 
            className="av"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <span className="av">{initials}</span>
        )}
        <span className="n">{firstName}</span>
      </button>

      {isOpen && (
        <div className="menu" role="menu">
          <Link 
            to={ROUTES.ORDERS} 
            role="menuitem"
            onClick={() => setIsOpen(false)}
          >
            📦 My Orders
          </Link>
          <Link 
            to={ROUTES.CHAT} 
            role="menuitem"
            onClick={() => setIsOpen(false)}
          >
            💬 AI Concierge
          </Link>
          {user.role === 'admin' && (
            <Link 
              to={ROUTES.ADMIN} 
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              🛡️ Admin CMS
            </Link>
          )}
          <hr />
          <button 
            role="menuitem"
            onClick={handleSignOut}
            type="button"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
