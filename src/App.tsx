import React, { useState, useEffect } from 'react';
import { auth, db, loginWithEmail, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, updateDoc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { Plus, Download, History, LogOut, User as UserIcon, FileText, Trash2, Calendar, Clock, DollarSign, Shield, Users, CheckCircle, XCircle } from 'lucide-react';
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
}

interface OvertimeEntry {
  date: string;
  day: string;
  natureOfDuty: string;
  fromTime: string;
  toTime: string;
  hours: number;
  amount: number;
  isGazettedHoliday: boolean;
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
  const [view, setView] = useState<'form' | 'history' | 'profile' | 'admin_users' | 'admin_claims'>('form');
  const [loading, setLoading] = useState(false);
  const [isAllowed, setIsAllowed] = useState(true);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Form State
  const [month, setMonth] = useState(new Date().toLocaleString('default', { month: 'short' }).toUpperCase());
  const [year, setYear] = useState(new Date().getFullYear());
  const [entries, setEntries] = useState<OvertimeEntry[]>([]);
  const [newEntry, setNewEntry] = useState<Partial<OvertimeEntry>>({
    date: '',
    natureOfDuty: 'Preparation and Conduct of exam',
    fromTime: '18:30',
    toTime: '19:30',
    isGazettedHoliday: false
  });

  // Admin State
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isAdminCreating, setIsAdminCreating] = useState(false);

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

    return () => {
      unsubClaims();
      unsubAllClaims();
      unsubUsers();
    };
  }, []);

  const handleAdminCreateUser = async () => {
    if (!newUserEmail || !newUserPassword || !newUserName) return;
    setIsAdminCreating(true);
    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          displayName: newUserName,
          adminEmail: user?.email // Current admin email for verification
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create user');
      }

      // Also add to allowed_users
      await setDoc(doc(db, 'allowed_users', newUserEmail.toLowerCase()), {
        email: newUserEmail.toLowerCase(),
        addedAt: serverTimestamp()
      });

      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      alert('User created successfully!');
    } catch (error: any) {
      console.error('Error creating user:', error);
      alert('Error: ' + error.message);
    } finally {
      setIsAdminCreating(false);
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
    if (!newEntry.date || !newEntry.fromTime || !newEntry.toTime) return;
    
    const day = getDayName(newEntry.date as string);
    const hours = calculateHours(newEntry.fromTime as string, newEntry.toTime as string);
    const amount = calculateAmount(hours, day, !!newEntry.isGazettedHoliday);
    
    const entry: OvertimeEntry = {
      date: newEntry.date as string,
      day,
      natureOfDuty: newEntry.natureOfDuty || '',
      fromTime: newEntry.fromTime as string,
      toTime: newEntry.toTime as string,
      hours,
      amount,
      isGazettedHoliday: !!newEntry.isGazettedHoliday
    };
    
    setEntries([...entries, entry]);
    setNewEntry({ ...newEntry, date: '' });
  };

  const handleRemoveEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const handleSaveClaim = async () => {
    if (!user || entries.length === 0) return;
    
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);
    
    const claim: OvertimeClaim = {
      uid: user.uid,
      userName: profile?.name || user.displayName || 'Unknown User',
      month,
      year,
      entries,
      totalHours,
      totalAmount,
      createdAt: serverTimestamp(),
      status: 'pending'
    };
    
    try {
      await addDoc(collection(db, 'claims'), claim);
      setEntries([]);
      setView('history');
    } catch (error) {
      console.error('Error saving claim:', error);
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
                  <h2 className="text-xl font-bold mb-4">Create New User</h2>
                  <p className="text-sm text-gray-500 mb-6">Create a new staff account with email and password.</p>
                  
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
                      label="Initial Password"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="••••••••" 
                      value={newUserPassword} 
                      onChange={setNewUserPassword}
                    />
                  </div>
                  <div className="flex items-center gap-2 mb-6">
                    <input 
                      type="checkbox" 
                      id="show-new-pass" 
                      checked={showNewPassword} 
                      onChange={(e) => setShowNewPassword(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <label htmlFor="show-new-pass" className="text-xs font-medium text-gray-600">Show Password</label>
                  </div>
                  <Button onClick={handleAdminCreateUser} disabled={isAdminCreating} className="w-full md:w-auto">
                    {isAdminCreating ? 'Creating...' : 'Create User Account'}
                  </Button>
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
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Input label="Month" value={month} onChange={setMonth} placeholder="NOV" />
                  <Input label="Year" type="number" value={year} onChange={(v: string) => setYear(parseInt(v))} />
                  <div className="col-span-2 flex items-end">
                    <p className="text-sm text-gray-500 italic">
                      Claim for {profile?.name || 'User'} ({profile?.designation || 'Designation'})
                    </p>
                  </div>
                </div>

                {/* Entry Form */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-blue-600" /> Add Overtime Entry
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                    <Input label="Date" type="date" value={newEntry.date} onChange={(v: string) => setNewEntry({ ...newEntry, date: v })} />
                    <Input label="Nature of Duty" value={newEntry.natureOfDuty} onChange={(v: string) => setNewEntry({ ...newEntry, natureOfDuty: v })} className="lg:col-span-2" />
                    <Input label="From" type="time" value={newEntry.fromTime} onChange={(v: string) => setNewEntry({ ...newEntry, fromTime: v })} />
                    <Input label="To" type="time" value={newEntry.toTime} onChange={(v: string) => setNewEntry({ ...newEntry, toTime: v })} />
                    <div className="flex items-center gap-2 h-10 px-2">
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
                  <Button onClick={handleAddEntry} className="mt-4 w-full">Add to List</Button>
                </div>

                {/* Entries List */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                        <tr>
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
                            <td colSpan={7} className="px-4 py-12 text-center text-gray-400 italic">No entries added yet.</td>
                          </tr>
                        )}
                      </tbody>
                      {entries.length > 0 && (
                        <tfoot className="bg-blue-50 font-bold">
                          <tr>
                            <td colSpan={4} className="px-4 py-3 text-right uppercase text-xs tracking-wider">Total</td>
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
                        Submit Claim
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
