import { Link } from 'react-router-dom';

interface UserLinkProps {
  username: string;
  className?: string;
}

export function UserLink({ username, className = '' }: UserLinkProps) {
  return (
    <Link
      to={`/users/${encodeURIComponent(username)}`}
      className={`text-blue-400 hover:text-blue-300 ${className}`}
    >
      {username}
    </Link>
  );
}
