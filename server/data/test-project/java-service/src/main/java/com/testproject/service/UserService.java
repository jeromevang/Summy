package com.testproject.service;

import com.testproject.model.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.persistence.EntityManager;
import javax.persistence.Query;
import java.util.List;
import java.util.Optional;

/**
 * User Service
 * Business logic for user operations
 * 
 * BUG: Contains SQL Injection vulnerability in searchUsers method
 */
@Service
public class UserService {

    @Autowired
    private EntityManager entityManager;

    /**
     * Search users by name or email
     * 
     * SECURITY BUG: SQL Injection vulnerability!
     * The search parameter is concatenated directly into the SQL query
     * without proper parameterization.
     * 
     * Example attack: search = "'; DROP TABLE users; --"
     */
    public List<User> searchUsers(String search) {
        // BUG: Raw string concatenation - vulnerable to SQL injection
        String sql = "SELECT * FROM users WHERE name LIKE '%" + search + "%' " +
                    "OR email LIKE '%" + search + "%'";
        
        Query query = entityManager.createNativeQuery(sql, User.class);
        return query.getResultList();
    }

    /**
     * Get all users with pagination (safe implementation)
     */
    public List<User> getAllUsers(int page, int limit) {
        String jpql = "SELECT u FROM User u ORDER BY u.createdAt DESC";
        return entityManager.createQuery(jpql, User.class)
                .setFirstResult((page - 1) * limit)
                .setMaxResults(limit)
                .getResultList();
    }

    /**
     * Get user by ID
     */
    public Optional<User> getUserById(Long id) {
        User user = entityManager.find(User.class, id);
        return Optional.ofNullable(user);
    }

    /**
     * Create new user
     */
    public User createUser(User user) {
        entityManager.persist(user);
        return user;
    }

    /**
     * Update user
     */
    public Optional<User> updateUser(Long id, User userData) {
        User existing = entityManager.find(User.class, id);
        if (existing == null) {
            return Optional.empty();
        }
        
        existing.setName(userData.getName());
        existing.setEmail(userData.getEmail());
        entityManager.merge(existing);
        
        return Optional.of(existing);
    }

    /**
     * Delete user
     */
    public void deleteUser(Long id) {
        User user = entityManager.find(User.class, id);
        if (user != null) {
            entityManager.remove(user);
        }
    }

    /**
     * SECURE version of search (for reference)
     * This is how the searchUsers method should be implemented
     */
    public List<User> searchUsersSecure(String search) {
        String jpql = "SELECT u FROM User u WHERE u.name LIKE :search OR u.email LIKE :search";
        return entityManager.createQuery(jpql, User.class)
                .setParameter("search", "%" + search + "%")
                .getResultList();
    }
}

