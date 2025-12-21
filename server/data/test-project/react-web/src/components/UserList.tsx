/**
 * User List Component
 * Displays a list of users with pagination
 */

import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

interface UserListProps {
  initialPage?: number;
  pageSize?: number;
}

export const UserList: React.FC<UserListProps> = ({
  initialPage = 1,
  pageSize = 10,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  
  const { get, loading, error } = useApi();

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const fetchUsers = async () => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: pageSize.toString(),
      ...(search && { search }),
    });
    
    const result = await get<{
      data: User[];
      pagination: { total: number; totalPages: number };
    }>(`/api/users?${params}`);
    
    if (result) {
      setUsers(result.data);
      setTotalPages(result.pagination.totalPages);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1); // Reset to first page on search
  };

  if (error) {
    return <div className="error">Failed to load users: {error.message}</div>;
  }

  return (
    <div className="user-list">
      <h2>Users</h2>
      
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={handleSearch}
        />
      </div>
      
      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.name || 'N/A'}</td>
                  <td>{user.email}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button onClick={() => console.log('Edit', user.id)}>
                      Edit
                    </button>
                    <button onClick={() => console.log('Delete', user.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="pagination">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default UserList;

