import React, { useState, useEffect } from 'react';
import { auth, db, loginWithEmail, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, updateDoc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { Plus, Download, History, LogOut, User as UserIcon, FileText, Trash2, Calendar, Clock, DollarSign, Shield, Users, CheckCircle, XCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getDayName, calculateHours, calculateAmount, numberToWords } from './lib/utils';
import { generateOvertimePDF } from './lib/pdfGenerator';

const ADMIN_EMAIL = "uraann4@gmail.com";

// --- Types ---
interface UserProfile {
  uid: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  payScale: string;
  bankAccount: string;
  bankName: string;
  role?: 'admin' | 'user';
  weekdayRate?: number;
  weekendRate?: number;
  holidayRate?: number;
}

interface OvertimeEntry {
  userId?: string;
  userName?: string;
  date: string;
  day: string;
  natureOfDuty: string;
  fromTime: string;
  toTime: string;
  hours: number;
  amount: number;
  isGazettedHoliday: boolean;
}

interface SelectedUserTime {
  uid: string;
  name: string;
  designation: string;
  date: string;
  fromTime: string;
  toTime: string;
}

interface OvertimeClaim {
  id?: string;
  uid: string;
  userName?: string; // Denormalized for admin view
  month: string;
  year: number;
  entries: OvertimeEntry[];
  totalHours: number;
  totalAmount: number;
  createdAt: any;
  status: 'pending' | 'approved' | 'rejected';
}

interface AllowedUser {
  email: string;
  addedAt: any;
}

// --- Components ---

const Button = ({ children, onClick, className, variant = 'primary', disabled = false }: any) => {
  const variants: any = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
    ghost: 'text-gray-500 hover:bg-gray-100'
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn('px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap', variants[variant], className)}
    >
      {children}
    </button>
  );
};

const Input = ({ label, value, onChange, type = 'text', placeholder, className }: any) => (
  <div className={cn('flex flex-col gap-1', className)}>
    {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>
);

const Badge = ({ children, variant = 'gray' }: any) => {
  const variants: any = {
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700'
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', variants[variant])}>
      {children}
    </span>
  );
};

export default function App() {
  const [user, setUser] = useState<any>({ uid: 'direct-access-uid', email: ADMIN_EMAIL, displayName: 'Direct Access Admin' });
  const [profile, setProfile] = useState<UserProfile | null>({
    uid: 'direct-access-uid',
    name: 'Direct Access Admin',
    email: ADMIN_EMAIL,
    designation: 'Super Admin',
    department: 'All',
    payScale: 'N/A',
    bankAccount: 'N/A',
    bankName: 'N/A',
    role: 'admin'
  });
  const [claims, setClaims] = useState<OvertimeClaim[]>([]);
  const [allClaims, setAllClaims] = useState<OvertimeClaim[]>([]);
  const [allowedUsers, setAllowedUsers] = useState<AllowedUser[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [view, setView] = useState<'form' | 'history' | 'profile' | 'admin_users' | 'admin_claims'>('form');
  const [loading, setLoading] = useState(false);
  const [isAllowed, setIsAllowed] = useState(true);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Form State
  const [selectedUserTimes, setSelectedUserTimes] = useState<SelectedUserTime[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [month, setMonth] = useState(new Date().toLocaleString('default', { month: 'short' }).toUpperCase());
  const [year, setYear] = useState(new Date().getFullYear());
  const [entries, setEntries] = useState<OvertimeEntry[]>([]);
  const [newEntry, setNewEntry] = useState<Partial<OvertimeEntry>>({
    date: '',
    natureOfDuty: 'Preparation and Conduct of exam',
    isGazettedHoliday: false
  });

  // Admin State
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserDesignation, setNewUserDesignation] = useState('');
  const [newUserDepartment, setNewUserDepartment] = useState('');
  const [newUserPayScale, setNewUserPayScale] = useState('');
  const [newUserBankAccount, setNewUserBankAccount] = useState('');
  const [newUserBankName, setNewUserBankName] = useState('');
  const [newUserWeekdayRate, setNewUserWeekdayRate] = useState(120);
  const [newUserWeekendRate, setNewUserWeekendRate] = useState(160);
  const [newUserHolidayRate, setNewUserHolidayRate] = useState(200);
  const [isAdminCreating, setIsAdminCreating] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const isAdmin = true;

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, '_connection_test', 'ping'));
        setDbConnected(true);
      } catch (error: any) {
        console.error("Firestore connection test failed:", error);
        if (error.message.includes('the client is offline')) {
          setDbConnected(false);
        } else {
          setDbConnected(true);
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    // Fetch User Claims
    const q = query(collection(db, 'claims'), where('uid', '==', 'direct-access-uid'), orderBy('createdAt', 'desc'));
    const unsubClaims = onSnapshot(q, (snapshot) => {
      setClaims(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OvertimeClaim)));
    }, (error) => {
      console.error("Error fetching claims:", error);
    });

    // Fetch All Claims
    const unsubAllClaims = onSnapshot(query(collection(db, 'claims'), orderBy('createdAt', 'desc')), (snapshot) => {
      setAllClaims(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OvertimeClaim)));
    }, (error) => {
      console.error("Error fetching all claims:", error);
    });

    // Fetch Allowed Users
    const unsubUsers = onSnapshot(collection(db, 'allowed_users'), (snapshot) => {
      setAllowedUsers(snapshot.docs.map(d => ({ email: d.id, ...d.data() } as AllowedUser)));
    }, (error) => {
      console.error("Error fetching allowed users:", error);
    });

    // Fetch All Users
    const unsubAllUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setAllUsers(snapshot.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile)));
    }, (error) => {
      console.error("Error fetching all users:", error);
    });

    return () => {
      unsubClaims();
      unsubAllClaims();
      unsubUsers();
      unsubAllUsers();
    };
  }, []);

  const handleAdminCreateUser = async () => {
    if (!newUserEmail || !newUserName) return;
    setIsAdminCreating(true);
    try {
      const userData = {
        name: newUserName,
        email: newUserEmail,
        designation: newUserDesignation,
        department: newUserDepartment,
        payScale: newUserPayScale,
        bankAccount: newUserBankAccount,
        bankName: newUserBankName,
        role: 'user',
        weekdayRate: newUserWeekdayRate,
        weekendRate: newUserWeekendRate,
        holidayRate: newUserHolidayRate
      };

      if (editingUserId) {
        await updateDoc(doc(db, 'users', editingUserId), userData);
        
        const oldUser = allUsers.find(u => u.uid === editingUserId);
        if (oldUser && oldUser.email !== newUserEmail) {
          await deleteDoc(doc(db, 'allowed_users', oldUser.email.toLowerCase()));
          await setDoc(doc(db, 'allowed_users', newUserEmail.toLowerCase()), {
            email: newUserEmail.toLowerCase(),
            addedAt: serverTimestamp()
          });
        }
        
        alert('User updated successfully!');
      } else {
        const newUserRef = doc(collection(db, 'users'));
        await setDoc(newUserRef, {
          ...userData,
          uid: newUserRef.id
        });
        
        // Also add to allowed_users
        await setDoc(doc(db, 'allowed_users', newUserEmail.toLowerCase()), {
          email: newUserEmail.toLowerCase(),
          addedAt: serverTimestamp()
        });
        alert('User created successfully!');
      }

      setEditingUserId(null);
      setNewUserEmail('');
      setNewUserName('');
      setNewUserDesignation('');
      setNewUserDepartment('');
      setNewUserPayScale('');
      setNewUserBankAccount('');
      setNewUserBankName('');
      setNewUserWeekdayRate(120);
      setNewUserWeekendRate(160);
      setNewUserHolidayRate(200);
    } catch (error: any) {
      console.error('Error saving user:', error);
      alert('Error: ' + error.message);
    } finally {
      setIsAdminCreating(false);
    }
  };

  const handleEditUser = (user: UserProfile) => {
    setEditingUserId(user.uid);
    setNewUserName(user.name || '');
    setNewUserEmail(user.email || '');
    setNewUserDesignation(user.designation || '');
    setNewUserDepartment(user.department || '');
    setNewUserPayScale(user.payScale || '');
    setNewUserBankAccount(user.bankAccount || '');
    setNewUserBankName(user.bankName || '');
    setNewUserWeekdayRate(user.weekdayRate || 120);
    setNewUserWeekendRate(user.weekendRate || 160);
    setNewUserHolidayRate(user.holidayRate || 200);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setNewUserEmail('');
    setNewUserName('');
    setNewUserDesignation('');
    setNewUserDepartment('');
    setNewUserPayScale('');
    setNewUserBankAccount('');
    setNewUserBankName('');
    setNewUserWeekdayRate(120);
    setNewUserWeekendRate(160);
    setNewUserHolidayRate(200);
  };

  const handleDeleteUser = async (uid: string, email: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await deleteDoc(doc(db, 'users', uid));
        await deleteDoc(doc(db, 'allowed_users', email.toLowerCase()));
        alert('User deleted successfully!');
      } catch (error: any) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user.');
      }
    }
  };

  const handleAddAllowedUser = async () => {
    if (!newUserEmail || !newUserEmail.includes('@')) return;
    await setDoc(doc(db, 'allowed_users', newUserEmail.toLowerCase()), {
      email: newUserEmail.toLowerCase(),
      addedAt: serverTimestamp()
    });
    setNewUserEmail('');
  };

  const handleRemoveAllowedUser = async (email: string) => {
    await deleteDoc(doc(db, 'allowed_users', email));
  };

  const handleUpdateClaimStatus = async (claimId: string, status: 'approved' | 'rejected') => {
    await updateDoc(doc(db, 'claims', claimId), { status });
  };

  const handleAddEntry = () => {
    if (selectedDates.length === 0 || selectedUserTimes.length === 0) {
      alert("Please fill all required fields, including selecting at least one date and one user.");
      return;
    }

    for (const su of selectedUserTimes) {
      if (!su.fromTime || !su.toTime) {
        alert(`Please fill times for ${su.name} on ${su.date}`);
        return;
      }
    }
    
    const newEntries: OvertimeEntry[] = selectedUserTimes.map(su => {
      const day = getDayName(su.date);
      const hours = calculateHours(su.fromTime, su.toTime);
      const selectedUser = allUsers.find(u => u.uid === su.uid);
      const rates = {
        weekday: selectedUser?.weekdayRate || 120,
        weekend: selectedUser?.weekendRate || 160,
        holiday: selectedUser?.holidayRate || 200
      };
      const amount = calculateAmount(hours, day, !!newEntry.isGazettedHoliday, rates);
      
      return {
        userId: su.uid,
        userName: su.name,
        date: su.date,
        day,
        natureOfDuty: newEntry.natureOfDuty || '',
        fromTime: su.fromTime,
        toTime: su.toTime,
        hours,
        amount,
        isGazettedHoliday: !!newEntry.isGazettedHoliday
      };
    });
    
    setEntries([...entries, ...newEntries]);
    // Clear only users, keep dates and duty for easy bulk entry
    setSelectedUserTimes([]);
  };

  const handleRemoveEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const handleSaveClaim = async () => {
    if (!user || entries.length === 0) return;
    
    try {
      // Group entries by user
      const groupedEntries: { [key: string]: OvertimeEntry[] } = {};
      entries.forEach(entry => {
        const uid = entry.userId || user.uid;
        if (!groupedEntries[uid]) groupedEntries[uid] = [];
        groupedEntries[uid].push(entry);
      });

      // Save a claim document for each user
      for (const uid of Object.keys(groupedEntries)) {
        const userEntries = groupedEntries[uid];
        const userName = userEntries[0].userName || profile?.name || user.displayName || 'Unknown User';
        
        const totalHours = userEntries.reduce((sum, e) => sum + e.hours, 0);
        const totalAmount = userEntries.reduce((sum, e) => sum + e.amount, 0);
        
        const claim: OvertimeClaim = {
          uid: uid,
          userName: userName,
          month,
          year,
          entries: userEntries,
          totalHours,
          totalAmount,
          status: 'pending',
          createdAt: serverTimestamp()
        };
        
        await addDoc(collection(db, 'claims'), claim);
        
        // Generate PDF for the user
        const claimUser = allUsers.find(u => u.uid === uid) || profile;
        if (claimUser) {
          generateOvertimePDF(claimUser, claim);
        }
      }
      
      setEntries([]);
      setView('history');
      alert("Claims saved and PDFs downloaded successfully!");
    } catch (error) {
      console.error('Error saving claim:', error);
      alert("Failed to save claims. Please try again.");
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !profile) return;
    await setDoc(doc(db, 'users', user.uid), profile);
    setView('form');
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">Bahria University</h1>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Overtime Claim Form</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full">
            <div className="w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 text-xs font-bold">
              {user.displayName?.[0] || 'A'}
            </div>
            <span className="text-sm font-medium text-gray-700">{user.displayName}</span>
            {isAdmin && <Badge variant="blue">Admin</Badge>}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 flex flex-col md:flex-row gap-8">
        {/* Sidebar Nav */}
        <nav className="w-full md:w-64 flex flex-col gap-2">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 mb-1">Main Menu</div>
          <button 
            onClick={() => setView('form')}
            className={cn('flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all', view === 'form' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-600 hover:bg-gray-100')}
          >
            <Plus className="w-5 h-5" /> New Claim
          </button>
          <button 
            onClick={() => setView('history')}
            className={cn('flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all', view === 'history' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-600 hover:bg-gray-100')}
          >
            <History className="w-5 h-5" /> My History
          </button>
          <button 
            onClick={() => setView('profile')}
            className={cn('flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all', view === 'profile' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-600 hover:bg-gray-100')}
          >
            <UserIcon className="w-5 h-5" /> My Profile
          </button>

          {isAdmin && (
            <>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 mt-6 mb-1">Admin Panel</div>
              <button 
                onClick={() => setView('admin_claims')}
                className={cn('flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all', view === 'admin_claims' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-600 hover:bg-gray-100')}
              >
                <Shield className="w-5 h-5" /> All Claims
              </button>
              <button 
                onClick={() => setView('admin_users')}
                className={cn('flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all', view === 'admin_users' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-600 hover:bg-gray-100')}
              >
                <Users className="w-5 h-5" /> Manage Users
              </button>
            </>
          )}
        </nav>

        {/* View Content */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {view === 'profile' && (
              <motion.div 
                key="profile"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100"
              >
                <h2 className="text-xl font-bold mb-6">Profile Settings</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input label="Full Name" value={profile?.name} onChange={(v: string) => setProfile({ ...profile!, name: v })} />
                  <Input label="Designation" value={profile?.designation} onChange={(v: string) => setProfile({ ...profile!, designation: v })} placeholder="e.g. COMPUTER OPERATOR" />
                  <Input label="Department" value={profile?.department} onChange={(v: string) => setProfile({ ...profile!, department: v })} placeholder="e.g. EXAM CELL" />
                  <Input label="Pay Scale" value={profile?.payScale} onChange={(v: string) => setProfile({ ...profile!, payScale: v })} placeholder="e.g. 5" />
                  <Input label="Bank Account No" value={profile?.bankAccount} onChange={(v: string) => setProfile({ ...profile!, bankAccount: v })} />
                  <Input label="Bank Name & Branch" value={profile?.bankName} onChange={(v: string) => setProfile({ ...profile!, bankName: v })} placeholder="e.g. BANK ALFALAH E-8 ISLAMABAD" />
                </div>
                <Button onClick={handleUpdateProfile} className="mt-8 w-full md:w-auto">Save Profile</Button>
              </motion.div>
            )}

            {view === 'admin_users' && isAdmin && (
              <motion.div 
                key="admin_users"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-6"
              >
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h2 className="text-xl font-bold mb-4">{editingUserId ? 'Edit User' : 'Create New User'}</h2>
                  <p className="text-sm text-gray-500 mb-6">{editingUserId ? 'Update staff account details.' : 'Create a new staff account with email and password.'}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <Input 
                      label="Full Name"
                      placeholder="John Doe" 
                      value={newUserName} 
                      onChange={setNewUserName}
                    />
                    <Input 
                      label="Email Address"
                      placeholder="user@example.com" 
                      value={newUserEmail} 
                      onChange={setNewUserEmail}
                    />
                    <Input 
                      label="Designation"
                      placeholder="e.g. COMPUTER OPERATOR" 
                      value={newUserDesignation} 
                      onChange={setNewUserDesignation}
                    />
                    <Input 
                      label="Department"
                      placeholder="e.g. EXAM CELL" 
                      value={newUserDepartment} 
                      onChange={setNewUserDepartment}
                    />
                    <Input 
                      label="Pay Scale"
                      placeholder="e.g. 5" 
                      value={newUserPayScale} 
                      onChange={setNewUserPayScale}
                    />
                    <Input 
                      label="Bank Account No"
                      placeholder="e.g. 1234567890" 
                      value={newUserBankAccount} 
                      onChange={setNewUserBankAccount}
                    />
                    <Input 
                      label="Bank Name & Branch"
                      placeholder="e.g. BANK ALFALAH E-8 ISLAMABAD" 
                      value={newUserBankName} 
                      onChange={setNewUserBankName}
                    />
                    <Input 
                      label="Weekday Rate"
                      type="number"
                      placeholder="120" 
                      value={newUserWeekdayRate} 
                      onChange={(v: string) => setNewUserWeekdayRate(Number(v))}
                    />
                    <Input 
                      label="Weekend Rate"
                      type="number"
                      placeholder="160" 
                      value={newUserWeekendRate} 
                      onChange={(v: string) => setNewUserWeekendRate(Number(v))}
                    />
                    <Input 
                      label="Holiday Rate"
                      type="number"
                      placeholder="200" 
                      value={newUserHolidayRate} 
                      onChange={(v: string) => setNewUserHolidayRate(Number(v))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleAdminCreateUser} disabled={isAdminCreating} className="w-full md:w-auto">
                      {isAdminCreating ? 'Saving...' : (editingUserId ? 'Update User Account' : 'Create User Account')}
                    </Button>
                    {editingUserId && (
                      <button onClick={handleCancelEdit} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold">Registered Staff Members</h2>
                    <p className="text-sm text-gray-500">Manage all registered staff members.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                        <tr>
                          <th className="px-6 py-4">Name</th>
                          <th className="px-6 py-4">Email</th>
                          <th className="px-6 py-4">Designation</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {allUsers.map((u) => (
                          <tr key={u.uid} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{u.name}</td>
                            <td className="px-6 py-4 text-gray-500">{u.email}</td>
                            <td className="px-6 py-4 text-gray-500">{u.designation}</td>
                            <td className="px-6 py-4 text-right">
                              {u.email !== ADMIN_EMAIL && (
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => handleEditUser(u)} className="text-blue-500 hover:text-blue-700 p-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                  </button>
                                  <button onClick={() => handleDeleteUser(u.uid, u.email)} className="text-red-400 hover:text-red-600 p-1">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {allUsers.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic">No staff members registered yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h2 className="text-xl font-bold mb-4">Whitelisted Emails</h2>
                  <p className="text-sm text-gray-500 mb-6">Emails listed here are allowed to access the system.</p>
                  
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Enter email to whitelist" 
                      value={newUserEmail} 
                      onChange={setNewUserEmail}
                      className="flex-1"
                    />
                    <Button onClick={handleAddAllowedUser}>
                      <Plus className="w-5 h-5" /> Whitelist Email
                    </Button>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                      <tr>
                        <th className="px-6 py-4">Email Address</th>
                        <th className="px-6 py-4">Added On</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allowedUsers.map((u) => (
                        <tr key={u.email} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-medium">{u.email}</td>
                          <td className="px-6 py-4 text-gray-500">{u.addedAt?.toDate().toLocaleDateString()}</td>
                          <td className="px-6 py-4 text-right">
                            {u.email !== ADMIN_EMAIL && (
                              <button onClick={() => handleRemoveAllowedUser(u.email)} className="text-red-400 hover:text-red-600 p-1">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {allowedUsers.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-gray-400 italic">No users whitelisted yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {view === 'admin_claims' && isAdmin && (
              <motion.div 
                key="admin_claims"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-4"
              >
                <h2 className="text-xl font-bold mb-2">All Staff Claims</h2>
                {allClaims.length === 0 ? (
                  <div className="bg-white p-12 rounded-2xl text-center border border-dashed border-gray-300 text-gray-400">
                    No claims submitted by any staff yet.
                  </div>
                ) : (
                  allClaims.map((claim) => (
                    <div key={claim.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                          <UserIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">{claim.userName}</h3>
                          <p className="text-xs text-gray-500">{claim.month} {claim.year} • {claim.createdAt?.toDate().toLocaleDateString()}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-8">
                        <div className="text-center">
                          <p className="text-xs text-gray-400 uppercase font-bold tracking-tighter">Hours</p>
                          <p className="font-bold text-gray-700">{claim.totalHours}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-400 uppercase font-bold tracking-tighter">Amount</p>
                          <p className="font-bold text-indigo-600">Rs. {claim.totalAmount}</p>
                        </div>
                        <Badge variant={claim.status === 'approved' ? 'green' : claim.status === 'rejected' ? 'red' : 'yellow'}>
                          {claim.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        {claim.status === 'pending' && (
                          <>
                            <button onClick={() => handleUpdateClaimStatus(claim.id!, 'approved')} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                              <CheckCircle className="w-6 h-6" />
                            </button>
                            <button onClick={() => handleUpdateClaimStatus(claim.id!, 'rejected')} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <XCircle className="w-6 h-6" />
                            </button>
                          </>
                        )}
                        <Button variant="outline" onClick={() => generateOvertimePDF({ name: claim.userName, designation: 'Staff', department: 'Bahria', payScale: '-', bankAccount: '-', bankName: '-' }, claim)} className="p-2">
                          <Download className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {view === 'form' && (
              <motion.div 
                key="form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-6"
              >
                {/* Claim Header Info */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-2 gap-4">
                  <Input label="Month" value={month} onChange={setMonth} placeholder="NOV" />
                  <Input label="Year" type="number" value={year} onChange={(v: string) => setYear(parseInt(v))} />
                </div>

                {/* Entry Form */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-blue-600" /> Add Overtime Entry
                  </h3>
                  
                  {/* Common Data */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 pb-4 border-b border-gray-100">
                    <div className="flex flex-col gap-2">
                      <Input 
                        label="Add Date (Common)" 
                        type="date" 
                        value={newEntry.date} 
                        onChange={(v: string) => {
                          if (v && !selectedDates.includes(v)) {
                            const newDates = [...selectedDates, v].sort();
                            setSelectedDates(newDates);
                            
                            // Add rows for existing unique users
                            const uniqueUsers = Array.from(new Map(selectedUserTimes.map(su => [su.uid, { uid: su.uid, name: su.name, designation: su.designation }])).values());
                            const newRows = uniqueUsers.map(u => ({
                              uid: u.uid,
                              name: u.name,
                              designation: u.designation,
                              date: v,
                              fromTime: '18:30',
                              toTime: '19:30'
                            }));
                            setSelectedUserTimes([...selectedUserTimes, ...newRows]);
                          }
                          setNewEntry({ ...newEntry, date: '' });
                        }} 
                      />
                      {selectedDates.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedDates.map(d => (
                            <span key={d} className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs flex items-center gap-1 font-medium">
                              {d}
                              <button onClick={() => {
                                setSelectedDates(selectedDates.filter(sd => sd !== d));
                                setSelectedUserTimes(selectedUserTimes.filter(su => su.date !== d));
                              }} className="hover:text-red-500">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Input label="Nature of Duty (Common)" value={newEntry.natureOfDuty} onChange={(v: string) => setNewEntry({ ...newEntry, natureOfDuty: v })} />
                    <div className="flex items-center gap-2 h-10 px-2 mt-6">
                      <input 
                        type="checkbox" 
                        id="gazetted" 
                        checked={newEntry.isGazettedHoliday} 
                        onChange={(e) => setNewEntry({ ...newEntry, isGazettedHoliday: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <label htmlFor="gazetted" className="text-xs font-medium text-gray-600">Gazetted Holiday</label>
                    </div>
                  </div>

                  {/* User Specific Data */}
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Add User</label>
                      <select 
                        className="w-full md:w-1/2 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                        value=""
                        onChange={(e) => {
                          const uid = e.target.value;
                          if (!uid) return;
                          if (selectedDates.length === 0) {
                            alert("Please select at least one date first.");
                            return;
                          }
                          if (selectedUserTimes.find(su => su.uid === uid)) return;
                          const user = allUsers.find(u => u.uid === uid);
                          if (user) {
                            const newRows = selectedDates.map(date => ({
                              uid: user.uid,
                              name: user.name,
                              designation: user.designation,
                              date: date,
                              fromTime: '18:30',
                              toTime: '19:30'
                            }));
                            setSelectedUserTimes([...selectedUserTimes, ...newRows]);
                          }
                        }}
                      >
                        <option value="">Select a user to add...</option>
                        {allUsers.map(u => (
                          <option key={u.uid} value={u.uid}>{u.name} ({u.designation})</option>
                        ))}
                      </select>
                    </div>

                    {selectedUserTimes.length > 0 && (
                      <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-gray-100 text-gray-600 uppercase text-xs font-bold">
                            <tr>
                              <th className="px-4 py-3">User</th>
                              <th className="px-4 py-3 w-32">Date</th>
                              <th className="px-4 py-3 w-32">From Time</th>
                              <th className="px-4 py-3 w-32">To Time</th>
                              <th className="px-4 py-3 w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {selectedUserTimes.map((su, idx) => (
                              <tr key={`${su.uid}-${su.date}`} className="bg-white">
                                <td className="px-4 py-3 font-medium text-blue-700">{su.name} <span className="text-xs text-gray-500 font-normal block">{su.designation}</span></td>
                                <td className="px-4 py-3 font-medium text-gray-600">{su.date}</td>
                                <td className="px-4 py-3">
                                  <input type="time" className="w-full px-2 py-1 border rounded" value={su.fromTime} onChange={e => {
                                    const newArr = [...selectedUserTimes];
                                    newArr[idx].fromTime = e.target.value;
                                    setSelectedUserTimes(newArr);
                                  }} />
                                </td>
                                <td className="px-4 py-3">
                                  <input type="time" className="w-full px-2 py-1 border rounded" value={su.toTime} onChange={e => {
                                    const newArr = [...selectedUserTimes];
                                    newArr[idx].toTime = e.target.value;
                                    setSelectedUserTimes(newArr);
                                  }} />
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button onClick={() => {
                                    const newArr = [...selectedUserTimes];
                                    newArr.splice(idx, 1);
                                    setSelectedUserTimes(newArr);
                                  }} className="text-red-400 hover:text-red-600 p-1">
                                    <X className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <Button onClick={handleAddEntry} className="mt-6 w-full">Add to List</Button>
                </div>

                {/* Entries List */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                        <tr>
                          <th className="px-4 py-3">User</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Day</th>
                          <th className="px-4 py-3">Duty</th>
                          <th className="px-4 py-3">Timing</th>
                          <th className="px-4 py-3">Hrs</th>
                          <th className="px-4 py-3">Amount</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {entries.map((entry, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-blue-700">{entry.userName}</td>
                            <td className="px-4 py-3 font-medium">{entry.date}</td>
                            <td className="px-4 py-3">{entry.day}</td>
                            <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{entry.natureOfDuty}</td>
                            <td className="px-4 py-3 text-xs font-mono">{entry.fromTime} - {entry.toTime}</td>
                            <td className="px-4 py-3 font-semibold">{entry.hours}</td>
                            <td className="px-4 py-3 font-bold text-blue-600">Rs. {entry.amount}</td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => handleRemoveEntry(idx)} className="text-red-400 hover:text-red-600 p-1">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {entries.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-4 py-12 text-center text-gray-400 italic">No entries added yet.</td>
                          </tr>
                        )}
                      </tbody>
                      {entries.length > 0 && (
                        <tfoot className="bg-blue-50 font-bold">
                          <tr>
                            <td colSpan={5} className="px-4 py-3 text-right uppercase text-xs tracking-wider">Total</td>
                            <td className="px-4 py-3">{entries.reduce((s, e) => s + e.hours, 0)}</td>
                            <td className="px-4 py-3 text-blue-700">Rs. {entries.reduce((s, e) => s + e.amount, 0)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  {entries.length > 0 && (
                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                      <p className="text-xs text-gray-500 italic">
                        Amount in words: {numberToWords(entries.reduce((s, e) => s + e.amount, 0))}
                      </p>
                      <Button onClick={handleSaveClaim} className="shadow-lg shadow-blue-100">
                        Submit All Claims
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {view === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-4"
              >
                <h2 className="text-xl font-bold mb-2">My Claim History</h2>
                {claims.length === 0 ? (
                  <div className="bg-white p-12 rounded-2xl text-center border border-dashed border-gray-300 text-gray-400">
                    No claims found.
                  </div>
                ) : (
                  claims.map((claim) => (
                    <div key={claim.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                          <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">{claim.month} {claim.year}</h3>
                          <p className="text-xs text-gray-500">Submitted on {claim.createdAt?.toDate().toLocaleDateString()}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-8">
                        <div className="text-center">
                          <p className="text-xs text-gray-400 uppercase font-bold tracking-tighter">Hours</p>
                          <p className="font-bold text-gray-700">{claim.totalHours}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-400 uppercase font-bold tracking-tighter">Amount</p>
                          <p className="font-bold text-blue-600">Rs. {claim.totalAmount}</p>
                        </div>
                        <Badge variant={claim.status === 'approved' ? 'green' : claim.status === 'rejected' ? 'red' : 'yellow'}>
                          {claim.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => generateOvertimePDF(profile, claim)} className="p-2">
                          <Download className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
