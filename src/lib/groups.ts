// Group and User management using localStorage

export interface Group {
    id: string;
    name: string;
    admin_id: string;
    created_at: string;
    updated_at: string;
}

export interface GroupUser {
    id: string;
    group_id: string;
    user_email: string;
    first_name: string;
    last_name: string;
    added_at: string;
    status: 'pending' | 'confirmed';
}

// New: Manage Request - for simplified admin-teacher relationship
export interface ManageRequest {
    id: string;
    admin_id: string;
    admin_name: string;
    admin_email: string;
    teacher_email: string;
    teacher_name: string;
    status: 'pending' | 'accepted' | 'rejected';
    requested_at: string;
    responded_at?: string;
}

// Get all groups for an admin
export function getGroups(adminId: string): Group[] {
    const data = localStorage.getItem('groups');
    if (!data) return [];
    try {
        const groups: Group[] = JSON.parse(data);
        return groups.filter(g => g.admin_id === adminId);
    } catch {
        return [];
    }
}

// Get a single group
export function getGroup(groupId: string): Group | null {
    const data = localStorage.getItem('groups');
    if (!data) return null;
    try {
        const groups: Group[] = JSON.parse(data);
        return groups.find(g => g.id === groupId) || null;
    } catch {
        return null;
    }
}

// Create a new group
export function createGroup(adminId: string, name: string): Group {
    const data = localStorage.getItem('groups');
    const groups: Group[] = data ? JSON.parse(data) : [];

    const newGroup: Group = {
        id: generateId(),
        name,
        admin_id: adminId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    groups.push(newGroup);
    localStorage.setItem('groups', JSON.stringify(groups));

    return newGroup;
}

// Update a group
export function updateGroup(groupId: string, name: string): Group | null {
    const data = localStorage.getItem('groups');
    if (!data) return null;

    const groups: Group[] = JSON.parse(data);
    const index = groups.findIndex(g => g.id === groupId);

    if (index === -1) return null;

    groups[index].name = name;
    groups[index].updated_at = new Date().toISOString();
    localStorage.setItem('groups', JSON.stringify(groups));

    return groups[index];
}

// Delete a group
export function deleteGroup(groupId: string): boolean {
    const data = localStorage.getItem('groups');
    if (!data) return false;

    const groups: Group[] = JSON.parse(data);
    const filteredGroups = groups.filter(g => g.id !== groupId);
    localStorage.setItem('groups', JSON.stringify(filteredGroups));

    // Also delete all users in this group
    const usersData = localStorage.getItem('group_users');
    if (usersData) {
        const users: GroupUser[] = JSON.parse(usersData);
        const filteredUsers = users.filter(u => u.group_id !== groupId);
        localStorage.setItem('group_users', JSON.stringify(filteredUsers));
    }

    return true;
}

// Get users in a group
export function getGroupUsers(groupId: string): GroupUser[] {
    const data = localStorage.getItem('group_users');
    if (!data) return [];
    try {
        const users: GroupUser[] = JSON.parse(data);
        return users.filter(u => u.group_id === groupId);
    } catch {
        return [];
    }
}

// Search all users (for adding to group)
export function searchUsers(query: string, currentUserEmail?: string): { email: string; firstName: string; lastName: string }[] {
    const usersData = localStorage.getItem(USERS_KEY);
    if (!usersData) return [];

    // Get all users already in any group (to exclude them from search)
    const groupUsersData = localStorage.getItem('group_users');
    const existingGroupUsers: GroupUser[] = groupUsersData ? JSON.parse(groupUsersData) : [];
    const existingEmails = new Set(existingGroupUsers.map(u => u.user_email));

    try {
        const users = JSON.parse(usersData);
        const searchLower = query.toLowerCase();

        return Object.entries(users)
            .filter(([email, userData]: [string, unknown]) => {
                // Exclude users who are already in any group
                if (existingEmails.has(email)) return false;

                // Exclude the current logged-in user
                if (currentUserEmail && email.toLowerCase() === currentUserEmail.toLowerCase()) return false;

                const user = userData as { profile: { firstName: string; lastName: string } };
                const fullName = `${user.profile.firstName} ${user.profile.lastName}`.toLowerCase();
                return email.toLowerCase().includes(searchLower) || fullName.includes(searchLower);
            })
            .map(([email, userData]: [string, unknown]) => {
                const user = userData as { profile: { firstName: string; lastName: string } };
                return {
                    email,
                    firstName: user.profile.firstName,
                    lastName: user.profile.lastName,
                };
            });
    } catch {
        return [];
    }
}

// Add user to group
export function addUserToGroup(groupId: string, email: string, firstName: string, lastName: string): GroupUser | null {
    try {
        const usersData = localStorage.getItem('group_users');
        const users: GroupUser[] = usersData ? JSON.parse(usersData) : [];

        // Check if user is already in this group
        const existingUser = users.find(u => u.group_id === groupId && u.user_email === email);
        if (existingUser) {
            return null;
        }

        const newUser: GroupUser = {
            id: generateId(),
            group_id: groupId,
            user_email: email,
            first_name: firstName,
            last_name: lastName,
            added_at: new Date().toISOString(),
            status: 'pending',
        };

        users.push(newUser);
        localStorage.setItem('group_users', JSON.stringify(users));

        return newUser;
    } catch {
        return null;
    }
}

// Remove user from group
export function removeUserFromGroup(userId: string): boolean {
    const usersData = localStorage.getItem('group_users');
    if (!usersData) return false;

    const users: GroupUser[] = JSON.parse(usersData);
    const filteredUsers = users.filter(u => u.id !== userId);
    localStorage.setItem('group_users', JSON.stringify(filteredUsers));

    return true;
}

// Get all users in all groups managed by an admin
export function getAdminGroupUsers(adminId: string): GroupUser[] {
    const groups = getGroups(adminId);
    const groupIds = groups.map(g => g.id);

    const usersData = localStorage.getItem('group_users');
    if (!usersData) return [];

    const users: GroupUser[] = JSON.parse(usersData);
    return users.filter(u => groupIds.includes(u.group_id));
}

// Confirm user in group (accept invitation)
export function confirmUserInGroup(userId: string): GroupUser | null {
    const usersData = localStorage.getItem('group_users');
    if (!usersData) return null;

    const users: GroupUser[] = JSON.parse(usersData);
    const index = users.findIndex(u => u.id === userId);

    if (index === -1) return null;

    users[index].status = 'confirmed';
    localStorage.setItem('group_users', JSON.stringify(users));

    return users[index];
}

// Get pending invitations for a user by email
export function getPendingInvitations(userEmail: string): (GroupUser & { groupName: string })[] {
    const usersData = localStorage.getItem('group_users');
    if (!usersData) return [];

    const users: GroupUser[] = JSON.parse(usersData);
    const pendingUsers = users.filter(u => u.user_email === userEmail && u.status === 'pending');

    // Get group names for each pending user
    const groupsData = localStorage.getItem('groups');
    if (!groupsData) return [];

    const groups: Group[] = JSON.parse(groupsData);

    return pendingUsers.map(user => {
        const group = groups.find(g => g.id === user.group_id);
        return {
            ...user,
            groupName: group?.name || 'Unknown Group',
        };
    });
}

// Manage Request Functions (simplified admin-teacher relationship)
const MANAGE_REQUESTS_KEY = 'manage_requests';

// Get manage requests sent by an admin
export function getManageRequestsSent(adminId: string): ManageRequest[] {
    const data = localStorage.getItem(MANAGE_REQUESTS_KEY);
    if (!data) return [];
    try {
        const requests: ManageRequest[] = JSON.parse(data);
        return requests.filter(r => r.admin_id === adminId);
    } catch {
        return [];
    }
}

// Get manage requests received by a teacher
export function getManageRequestsReceived(userEmail: string): ManageRequest[] {
    const data = localStorage.getItem(MANAGE_REQUESTS_KEY);
    if (!data) return [];
    try {
        const requests: ManageRequest[] = JSON.parse(data);
        return requests.filter(r => r.teacher_email === userEmail);
    } catch {
        return [];
    }
}

// Get accepted manage request for a teacher (who is managing them)
export function getManagingAdmin(userEmail: string): ManageRequest | null {
    const data = localStorage.getItem(MANAGE_REQUESTS_KEY);
    if (!data) return null;
    try {
        const requests: ManageRequest[] = JSON.parse(data);
        const accepted = requests.find(r => r.teacher_email === userEmail && r.status === 'accepted');
        return accepted || null;
    } catch {
        return null;
    }
}

// Send manage request from admin to teacher
export function sendManageRequest(
    adminId: string,
    adminName: string,
    adminEmail: string,
    teacherEmail: string,
    teacherName: string
): ManageRequest | null {
    try {
        const data = localStorage.getItem(MANAGE_REQUESTS_KEY);
        const requests: ManageRequest[] = data ? JSON.parse(data) : [];

        // Check if request already exists
        const existing = requests.find(
            r => r.admin_id === adminId && r.teacher_email === teacherEmail && r.status === 'pending'
        );
        if (existing) {
            return null;
        }

        const newRequest: ManageRequest = {
            id: generateId(),
            admin_id: adminId,
            admin_name: adminName,
            admin_email: adminEmail,
            teacher_email: teacherEmail,
            teacher_name: teacherName,
            status: 'pending',
            requested_at: new Date().toISOString(),
        };

        requests.push(newRequest);
        localStorage.setItem(MANAGE_REQUESTS_KEY, JSON.stringify(requests));

        return newRequest;
    } catch {
        return null;
    }
}

// Accept manage request
export function acceptManageRequest(requestId: string): ManageRequest | null {
    const data = localStorage.getItem(MANAGE_REQUESTS_KEY);
    if (!data) return null;

    const requests: ManageRequest[] = JSON.parse(data);
    const index = requests.findIndex(r => r.id === requestId);

    if (index === -1) return null;

    // Reject any other accepted requests for this teacher first
    const teacherEmail = requests[index].teacher_email;
    requests.forEach(r => {
        if (r.teacher_email === teacherEmail && r.status === 'accepted') {
            r.status = 'rejected';
            r.responded_at = new Date().toISOString();
        }
    });

    requests[index].status = 'accepted';
    requests[index].responded_at = new Date().toISOString();
    localStorage.setItem(MANAGE_REQUESTS_KEY, JSON.stringify(requests));

    return requests[index];
}

// Reject manage request
export function rejectManageRequest(requestId: string): boolean {
    const data = localStorage.getItem(MANAGE_REQUESTS_KEY);
    if (!data) return false;

    const requests: ManageRequest[] = JSON.parse(data);
    const index = requests.findIndex(r => r.id === requestId);

    if (index === -1) return false;

    requests[index].status = 'rejected';
    requests[index].responded_at = new Date().toISOString();
    localStorage.setItem(MANAGE_REQUESTS_KEY, JSON.stringify(requests));

    return true;
}

// Cancel manage request
export function cancelManageRequest(requestId: string): boolean {
    const data = localStorage.getItem(MANAGE_REQUESTS_KEY);
    if (!data) return false;

    const requests: ManageRequest[] = JSON.parse(data);
    const filtered = requests.filter(r => r.id !== requestId);
    localStorage.setItem(MANAGE_REQUESTS_KEY, JSON.stringify(filtered));

    return true;
}

// Search users (by id, name, email)
export function searchUsersNew(
    query: string,
    currentUserEmail?: string
): { email: string; firstName: string; lastName: string; id: string }[] {
    const usersData = localStorage.getItem(USERS_KEY);
    if (!usersData) return [];

    try {
        const users = JSON.parse(usersData);
        const searchLower = query.toLowerCase();

        return Object.entries(users)
            .filter(([email, userData]: [string, unknown]) => {
                // Exclude the current logged-in user
                if (currentUserEmail && email.toLowerCase() === currentUserEmail.toLowerCase()) return false;

                const user = userData as { profile: { firstName: string; lastName: string; id: string } };
                const fullName = `${user.profile.firstName} ${user.profile.lastName}`.toLowerCase();
                const userId = user.profile.id || '';
                return (
                    email.toLowerCase().includes(searchLower) ||
                    fullName.includes(searchLower) ||
                    userId.toLowerCase().includes(searchLower)
                );
            })
            .map(([email, userData]: [string, unknown]) => {
                const user = userData as { profile: { firstName: string; lastName: string; id: string } };
                return {
                    email,
                    firstName: user.profile.firstName,
                    lastName: user.profile.lastName,
                    id: user.profile.id || '',
                };
            });
    } catch {
        return [];
    }
}

// Get user ID by email (from auth context)
const USERS_KEY = 'app_users';

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}