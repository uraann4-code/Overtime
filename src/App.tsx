import React, { useState, useEffect } from 'react';
import { auth, db, loginWithEmail, logout } from './firebase';
import { onAuthStateChanged, User, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, deleteDoc, updateDoc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { Plus, Download, History, LogOut, User as UserIcon, FileText, Trash2, Calendar, Clock, DollarSign, Shield, Users, CheckCircle, XCircle, X, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getDayName, calculateHours, calculateAmount, numberToWords } from './lib/utils';
import { generateOvertimePDF, generateSummaryPDF, SummaryRow } from './lib/pdfGenerator';
import { generateOvertimeExcel } from './lib/excelGenerator';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const ADMIN_EMAIL = "uraann4@gmail.com";

// --- Types ---
interface UserProfile {
  uid: string;
  name: string;
  email?: string;
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
  payScale: string;
  date: string;
  fromTime: string;
  toTime: string;
  isGazettedHoliday?: boolean;
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
  department?: string;
  createdBy?: string;
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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [claims, setClaims] = useState<OvertimeClaim[]>([]);
  const [allClaims, setAllClaims] = useState<OvertimeClaim[]>([]);
  const [allowedUsers, setAllowedUsers] = useState<AllowedUser[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [view, setView] = useState<'form' | 'history' | 'profile' | 'admin_users' | 'admin_claims'>('form');
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(true);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Form State
  const [selectedUserTimes, setSelectedUserTimes] = useState<SelectedUserTime[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [commonFromTime, setCommonFromTime] = useState('18:30');
  const [commonToTime, setCommonToTime] = useState('19:30');
  const [commonTimeDate, setCommonTimeDate] = useState('all');
  const [month, setMonth] = useState(new Date().toLocaleString('default', { month: 'short' }).toUpperCase());
  const [year, setYear] = useState(new Date().getFullYear());
  const [entries, setEntries] = useState<OvertimeEntry[]>([]);
  const [newEntry, setNewEntry] = useState<Partial<OvertimeEntry>>({
    date: '',
    natureOfDuty: 'Preparation and Conduct of exam'
  });
  const [copiedTime, setCopiedTime] = useState<{fromTime: string, toTime: string, isGazettedHoliday: boolean} | null>(null);

  // Admin State
  const [whitelistEmail, setWhitelistEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserDesignation, setNewUserDesignation] = useState('');
  const [newUserDepartment, setNewUserDepartment] = useState('');
  const [newUserPayScale, setNewUserPayScale] = useState('');
  const [newUserBankAccount, setNewUserBankAccount] = useState('');
  const [newUserBankName, setNewUserBankName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin' | 'operator'>('user');
  const [newUserWeekdayRate, setNewUserWeekdayRate] = useState(120);
  const [newUserWeekendRate, setNewUserWeekendRate] = useState(160);
  const [newUserHolidayRate, setNewUserHolidayRate] = useState(200);
  const [isAdminCreating, setIsAdminCreating] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch user profile
        const unsubProfile = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
            setIsAllowed(true);
          } else {
            // Check if they are in allowed_users
            getDoc(doc(db, 'allowed_users', currentUser.email!.toLowerCase())).then(allowedSnap => {
              if (allowedSnap.exists() || currentUser.email === ADMIN_EMAIL) {
                // Auto-create profile
                const newProfile: UserProfile = {
                  uid: currentUser.uid,
                  name: currentUser.displayName || currentUser.email!.split('@')[0],
                  email: currentUser.email!,
                  designation: '',
                  department: '',
                  payScale: '',
                  bankAccount: '',
                  bankName: '',
                  role: currentUser.email === ADMIN_EMAIL ? 'admin' : 'user'
                };
                setDoc(doc(db, 'users', currentUser.uid), newProfile);
                setProfile(newProfile);
                setIsAllowed(true);
              } else {
                setIsAllowed(false);
              }
            });
          }
        });
        setLoading(false);
        return () => unsubProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

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
    if (!user || !profile) return;

    // Fetch User Claims
    let q;
    if (profile.role === 'admin') {
      q = query(collection(db, 'claims'), orderBy('createdAt', 'desc'));
    } else if (profile.role === 'operator') {
      q = query(collection(db, 'claims'), where('department', '==', profile.department), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'claims'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    }
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
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      await loginWithEmail(loginEmail, loginPassword);
    } catch (error: any) {
      if ((error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') && loginEmail === ADMIN_EMAIL) {
        try {
          // Auto-create admin if it doesn't exist
          await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
        } catch (createError: any) {
          setAuthError(createError.message);
        }
      } else {
        setAuthError(error.message || 'Failed to login. Please check your credentials.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminCreateUser = async () => {
    if (!newUserName) return;
    setIsAdminCreating(true);
    try {
      const userData = {
        name: newUserName,
        email: newUserEmail.toLowerCase(),
        designation: newUserDesignation,
        department: newUserDepartment,
        payScale: newUserPayScale,
        bankAccount: newUserBankAccount,
        bankName: newUserBankName,
        role: newUserRole,
        weekdayRate: newUserWeekdayRate,
        weekendRate: newUserWeekendRate,
        holidayRate: newUserHolidayRate
      };

      if (editingUserId) {
        await updateDoc(doc(db, 'users', editingUserId), userData);
        if (newUserEmail) {
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
        if (newUserEmail) {
          await setDoc(doc(db, 'allowed_users', newUserEmail.toLowerCase()), {
            email: newUserEmail.toLowerCase(),
            addedAt: serverTimestamp()
          });
        }
        alert('User created successfully!');
      }

      setEditingUserId(null);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserRole('user');
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
    setNewUserDesignation(user.designation || '');
    setNewUserDepartment(user.department || '');
    setNewUserPayScale(user.payScale || '');
    setNewUserBankAccount(user.bankAccount || '');
    setNewUserBankName(user.bankName || '');
    setNewUserEmail(user.email || '');
    setNewUserRole(user.role || 'user');
    setNewUserWeekdayRate(user.weekdayRate || 120);
    setNewUserWeekendRate(user.weekendRate || 160);
    setNewUserHolidayRate(user.holidayRate || 200);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setNewUserName('');
    setNewUserDesignation('');
    setNewUserDepartment('');
    setNewUserPayScale('');
    setNewUserBankAccount('');
    setNewUserBankName('');
    setNewUserEmail('');
    setNewUserRole('user');
    setNewUserWeekdayRate(120);
    setNewUserWeekendRate(160);
    setNewUserHolidayRate(200);
  };

  const handleAddAllowedUser = async () => {
    if (!whitelistEmail || !whitelistEmail.includes('@')) return;
    await setDoc(doc(db, 'allowed_users', whitelistEmail.toLowerCase()), {
      email: whitelistEmail.toLowerCase(),
      addedAt: serverTimestamp()
    });
    setWhitelistEmail('');
  };

  const handleRemoveAllowedUser = async (email: string) => {
    await deleteDoc(doc(db, 'allowed_users', email));
  };

  const handleUpdateClaimStatus = async (claimId: string, status: 'approved' | 'rejected') => {
    await updateDoc(doc(db, 'claims', claimId), { status });
  };

  const getDefaultTimes = (dateStr: string) => {
    const day = getDayName(dateStr);
    if (day === 'Saturday' || day === 'Sunday') {
      return { fromTime: '09:00', toTime: '17:00' };
    }
    return { fromTime: '18:30', toTime: '20:30' }; // 18:30 is 6:30 PM
  };

  const handleApplyCommonTimeToAll = () => {
    const updated = selectedUserTimes.map(su => {
      if (commonTimeDate === 'all' || su.date === commonTimeDate) {
        return {
          ...su,
          fromTime: commonFromTime,
          toTime: commonToTime
        };
      }
      return su;
    });
    setSelectedUserTimes(updated);
  };

  const handleAddDateRange = () => {
    if (!fromDate || !toDate) {
      alert("Please select both From and To dates.");
      return;
    }
    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (start > end) {
      alert("From Date cannot be later than To Date.");
      return;
    }

    const newDatesToAdd: string[] = [];
    let current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      if (!selectedDates.includes(dateStr)) {
        newDatesToAdd.push(dateStr);
      }
      current.setDate(current.getDate() + 1);
    }

    if (newDatesToAdd.length > 0) {
      const newDates = [...selectedDates, ...newDatesToAdd].sort();
      setSelectedDates(newDates);

      // Add rows for existing unique users
      const uniqueUsers = Array.from(new Map<string, { uid: string, name: string, designation: string, payScale: string }>(selectedUserTimes.map(su => [su.uid, { uid: su.uid, name: su.name, designation: su.designation, payScale: su.payScale }])).values());
      
      const newRows: SelectedUserTime[] = [];
      uniqueUsers.forEach(u => {
        newDatesToAdd.forEach(d => {
          const { fromTime, toTime } = getDefaultTimes(d);
          newRows.push({
            uid: u.uid,
            name: u.name,
            designation: u.designation,
            payScale: u.payScale,
            date: d,
            fromTime,
            toTime,
            isGazettedHoliday: false
          });
        });
      });

      const updatedArr = [...selectedUserTimes, ...newRows];
      const userOrderMap = new Map();
      updatedArr.forEach((su, index) => {
        if (!userOrderMap.has(su.uid)) {
          userOrderMap.set(su.uid, index);
        }
      });
      updatedArr.sort((a, b) => {
        const orderA = userOrderMap.get(a.uid);
        const orderB = userOrderMap.get(b.uid);
        if (orderA !== orderB) return orderA - orderB;
        return a.date.localeCompare(b.date);
      });
      setSelectedUserTimes(updatedArr);
    }
    
    setFromDate('');
    setToDate('');
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
      const amount = calculateAmount(hours, day, !!su.isGazettedHoliday, rates);
      
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
        isGazettedHoliday: !!su.isGazettedHoliday
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
      const savedClaims = [];
      for (const uid of Object.keys(groupedEntries)) {
        const userEntries = groupedEntries[uid];
        const userName = userEntries[0].userName || profile?.name || user.displayName || 'Unknown User';
        
        const totalHours = userEntries.reduce((sum, e) => sum + e.hours, 0);
        const totalAmount = userEntries.reduce((sum, e) => sum + e.amount, 0);
        const targetUser = allUsers.find(u => u.uid === uid);
        
        const claim: OvertimeClaim = {
          uid: uid || '',
          userName: userName || 'Unknown User',
          month: month || '',
          year: year || new Date().getFullYear(),
          entries: userEntries.map(e => ({
            userId: e.userId || '',
            userName: e.userName || 'Unknown User',
            date: e.date || '',
            day: e.day || '',
            natureOfDuty: e.natureOfDuty || '',
            fromTime: e.fromTime || '',
            toTime: e.toTime || '',
            hours: e.hours || 0,
            amount: e.amount || 0,
            isGazettedHoliday: !!e.isGazettedHoliday
          })),
          totalHours: totalHours || 0,
          totalAmount: totalAmount || 0,
          status: 'pending',
          createdAt: serverTimestamp(),
          department: targetUser?.department || profile?.department || '',
          createdBy: user.uid
        };
        
        await addDoc(collection(db, 'claims'), claim);
        savedClaims.push({ uid, claim, userName });
      }
      
      // Generate PDF for the user
      if (savedClaims.length > 0) {
        const zip = new JSZip();
        const summaryData: SummaryRow[] = [];
        let srNo = 1;

        for (const { uid, claim, userName } of savedClaims) {
          const claimUser = allUsers.find(u => u.uid === uid) || profile;
          if (claimUser) {
            try {
              const pdfBlob = generateOvertimePDF(claimUser, claim, true) as Blob;
              const safeName = (claimUser.name || userName || 'User').replace(/[^a-zA-Z0-9 _-]/g, '');
              const safeMonth = (claim.month || '').replace(/[^a-zA-Z0-9 _-]/g, '');
              zip.file(`Overtime_Claim_${safeName}_${safeMonth}_${claim.year || ''}.pdf`, pdfBlob);
              
              // Calculate summary data
              const weekdaysHours = claim.entries.filter((e: any) => !e.isGazettedHoliday && e.day !== 'Saturday' && e.day !== 'Sunday').reduce((sum: number, e: any) => sum + e.hours, 0);
              const weekendHours = claim.entries.filter((e: any) => e.isGazettedHoliday || e.day === 'Saturday' || e.day === 'Sunday').reduce((sum: number, e: any) => sum + e.hours, 0);
              
              summaryData.push({
                srNo: srNo++,
                name: claimUser.name || userName || 'Unknown',
                designation: claimUser.designation || '',
                bankAccount: claimUser.bankAccount || '',
                weekdaysHours,
                weekendHours,
                amount: claim.totalAmount || 0
              });
            } catch (pdfError) {
              console.error('Error generating PDF for', userName, pdfError);
            }
          }
        }
        
        if (summaryData.length > 0) {
          try {
            const summaryBlob = generateSummaryPDF(month, year, summaryData, true) as Blob;
            const safeMonthZip = (month || '').replace(/[^a-zA-Z0-9 _-]/g, '');
            zip.file(`Summary_${safeMonthZip}_${year}.pdf`, summaryBlob);
          } catch (summaryError) {
            console.error('Error generating summary PDF', summaryError);
          }
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const safeMonthZip = (month || '').replace(/[^a-zA-Z0-9 _-]/g, '');
        saveAs(zipBlob, `Bulk_Overtime_Claims_${safeMonthZip}_${year}.zip`);
      }
      
      setEntries([]);
      setView('history');
      alert("Claims saved and PDFs downloaded successfully!");
    } catch (error: any) {
      console.error('Error saving claim:', error);
      alert(`Failed to save claims. Error: ${error.message || error}`);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !profile) return;
    await setDoc(doc(db, 'users', user.uid), profile);
    setView('form');
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-200">
              <FileText className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Bahria University</h1>
            <p className="text-sm text-gray-500 uppercase tracking-wider mt-1">Overtime Claim System</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {authError && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                {authError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="Enter your email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="Enter your password"
              />
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 mt-6 shadow-lg shadow-blue-200"
            >
              {isLoggingIn ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto mb-4">
            <Shield className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">Your email ({user.email}) is not authorized to access this system. Please contact the administrator.</p>
          <button
            onClick={() => auth.signOut()}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

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
              {user.displayName?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <span className="text-sm font-medium text-gray-700">{user.displayName || user.email?.split('@')[0]}</span>
            {isAdmin && <Badge variant="blue">Admin</Badge>}
          </div>
          <button
            onClick={() => auth.signOut()}
            className="text-sm font-medium text-red-600 hover:text-red-700 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors"
          >
            Sign Out
          </button>
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
                  <p className="text-sm text-gray-500 mb-6">{editingUserId ? 'Update staff details.' : 'Create a new staff record.'}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <Input 
                      label="Full Name"
                      placeholder="John Doe" 
                      value={newUserName} 
                      onChange={setNewUserName}
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
                      label="Login Email (Optional)"
                      placeholder="user@example.com" 
                      value={newUserEmail} 
                      onChange={setNewUserEmail}
                    />
                    <div className="flex flex-col gap-2">
                      <label className="block text-sm font-medium text-gray-700">User Role</label>
                      <select 
                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as any)}
                      >
                        <option value="user">Staff Member</option>
                        <option value="operator">Department Operator</option>
                        <option value="admin">Super Admin</option>
                      </select>
                    </div>
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
                      <thead className="bg-gray-50 text-gray-600 uppercase text-[10px] font-bold tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">Designation / Dept</th>
                          <th className="px-4 py-3 text-center">Pay Scale</th>
                          <th className="px-4 py-3">Bank Details</th>
                          <th className="px-4 py-3 text-center">Rates (W/WE/H)</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-xs">
                        {[...allUsers].sort((a, b) => (parseInt(b.payScale) || 0) - (parseInt(a.payScale) || 0)).map((u) => (
                          <tr key={u.uid} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                            <td className="px-4 py-3 text-gray-600">
                              <div className="font-medium">{u.designation}</div>
                              <div className="text-[10px] text-gray-400">{u.department}</div>
                            </td>
                            <td className="px-4 py-3 text-center font-medium">{u.payScale}</td>
                            <td className="px-4 py-3 text-gray-600">
                              <div className="font-medium">{u.bankAccount}</div>
                              <div className="text-[10px] text-gray-400">{u.bankName}</div>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-500">
                              {u.weekdayRate} / {u.weekendRate} / {u.holidayRate}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {u.email !== ADMIN_EMAIL && (
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => handleEditUser(u)} className="text-blue-500 hover:text-blue-700 p-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {allUsers.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-12 text-center text-gray-400 italic">No staff members registered yet.</td>
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
                      value={whitelistEmail} 
                      onChange={setWhitelistEmail}
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
                        <Button variant="outline" onClick={() => {
                          const claimUser = allUsers.find(u => u.uid === claim.uid) || { 
                            name: claim.userName, 
                            designation: 'Staff', 
                            department: 'Bahria', 
                            payScale: '-', 
                            bankAccount: '-', 
                            bankName: '-' 
                          };
                          generateOvertimePDF(claimUser, claim);
                        }} className="p-2" title="Download PDF">
                          <Download className="w-5 h-5 text-red-500" />
                        </Button>
                        <Button variant="outline" onClick={() => {
                          const claimUser = allUsers.find(u => u.uid === claim.uid) || { 
                            name: claim.userName, 
                            designation: 'Staff', 
                            department: 'Bahria', 
                            payScale: '-', 
                            bankAccount: '-', 
                            bankName: '-' 
                          };
                          generateOvertimeExcel(claimUser, claim);
                        }} className="p-2" title="Download Excel">
                          <Download className="w-5 h-5 text-green-600" />
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
                  <div className="mb-4 pb-4 border-b border-gray-100">
                    <div className="flex flex-col lg:flex-row gap-6 mb-4">
                      <div className="flex-1 flex flex-col gap-2">
                        <Input 
                          label="Add Single Date" 
                          type="date" 
                          value={newEntry.date} 
                          onChange={(v: string) => {
                            if (v && !selectedDates.includes(v)) {
                              const newDates = [...selectedDates, v].sort();
                              setSelectedDates(newDates);
                              
                              // Add rows for existing unique users
                              const uniqueUsers = Array.from(new Map<string, { uid: string, name: string, designation: string, payScale: string }>(selectedUserTimes.map(su => [su.uid, { uid: su.uid, name: su.name, designation: su.designation, payScale: su.payScale }])).values());
                              const { fromTime, toTime } = getDefaultTimes(v);
                              const newRows = uniqueUsers.map(u => ({
                                uid: u.uid,
                                name: u.name,
                                designation: u.designation,
                                payScale: u.payScale,
                                date: v,
                                fromTime,
                                toTime,
                                isGazettedHoliday: false
                              }));
                              const updatedArr = [...selectedUserTimes, ...newRows];
                              const userOrderMap = new Map();
                              updatedArr.forEach((su, index) => {
                                if (!userOrderMap.has(su.uid)) {
                                  userOrderMap.set(su.uid, index);
                                }
                              });
                              updatedArr.sort((a, b) => {
                                const orderA = userOrderMap.get(a.uid);
                                const orderB = userOrderMap.get(b.uid);
                                if (orderA !== orderB) return orderA - orderB;
                                return a.date.localeCompare(b.date);
                              });
                              setSelectedUserTimes(updatedArr);
                            }
                            setNewEntry({ ...newEntry, date: '' });
                          }} 
                        />
                      </div>
                      
                      <div className="flex items-center justify-center font-bold text-gray-400 pt-6">OR</div>
                      
                      <div className="flex-[2] flex flex-col gap-2">
                        <label className="block text-sm font-medium text-gray-700">Add Date Range</label>
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <Input type="date" value={fromDate} onChange={setFromDate} />
                          </div>
                          <div className="flex-1">
                            <Input type="date" value={toDate} onChange={setToDate} />
                          </div>
                          <Button onClick={handleAddDateRange} className="whitespace-nowrap">Add Range</Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        {selectedDates.length > 0 && (
                          <div className="flex flex-col gap-2">
                            <label className="block text-sm font-medium text-gray-700">Selected Dates ({selectedDates.length})</label>
                            <div className="flex flex-wrap gap-1">
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
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-4">
                        <Input label="Nature of Duty (Common)" value={newEntry.natureOfDuty} onChange={(v: string) => setNewEntry({ ...newEntry, natureOfDuty: v })} />
                        
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Common Time Settings</label>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-end gap-2">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Apply To Date</label>
                                <select 
                                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-sm"
                                  value={commonTimeDate}
                                  onChange={(e) => setCommonTimeDate(e.target.value)}
                                >
                                  <option value="all">All Selected Dates</option>
                                  {selectedDates.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex-1">
                                <Input type="time" label="From Time" value={commonFromTime} onChange={setCommonFromTime} />
                              </div>
                              <div className="flex-1">
                                <Input type="time" label="To Time" value={commonToTime} onChange={setCommonToTime} />
                              </div>
                            </div>
                            <Button onClick={handleApplyCommonTimeToAll} className="w-full bg-gray-800 hover:bg-gray-900">Apply Time</Button>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">This time will be used as default for new entries.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* User Specific Data */}
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Add User</label>
                        <select 
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
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
                              const newRows = selectedDates.map(date => {
                                const { fromTime, toTime } = getDefaultTimes(date);
                                return {
                                  uid: user.uid,
                                  name: user.name,
                                  designation: user.designation,
                                  payScale: user.payScale,
                                  date: date,
                                  fromTime,
                                  toTime,
                                  isGazettedHoliday: false
                                };
                              });
                              const updatedArr = [...selectedUserTimes, ...newRows];
                              const userOrderMap = new Map();
                              updatedArr.forEach((su, index) => {
                                if (!userOrderMap.has(su.uid)) {
                                  userOrderMap.set(su.uid, index);
                                }
                              });
                              updatedArr.sort((a, b) => {
                                const orderA = userOrderMap.get(a.uid);
                                const orderB = userOrderMap.get(b.uid);
                                if (orderA !== orderB) return orderA - orderB;
                                return a.date.localeCompare(b.date);
                              });
                              setSelectedUserTimes(updatedArr);
                            }
                          }}
                        >
                          <option value="">Select a user to add...</option>
                          {[...allUsers]
                            .filter(u => isAdmin || !profile?.department || u.department === profile.department)
                            .sort((a, b) => (parseInt(b.payScale) || 0) - (parseInt(a.payScale) || 0))
                            .map(u => (
                              <option key={u.uid} value={u.uid}>{u.name} ({u.designation})</option>
                            ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Add by Department</label>
                        <select 
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                          value=""
                          onChange={(e) => {
                            const dept = e.target.value;
                            if (!dept) return;
                            if (selectedDates.length === 0) {
                              alert("Please select at least one date first.");
                              return;
                            }
                            
                            const usersInDept = allUsers.filter(u => u.department === dept).sort((a, b) => (parseInt(b.payScale) || 0) - (parseInt(a.payScale) || 0));
                            const newRowsToAdd: SelectedUserTime[] = [];
                            
                            usersInDept.forEach(user => {
                              if (!selectedUserTimes.find(su => su.uid === user.uid)) {
                                selectedDates.forEach(date => {
                                  const { fromTime, toTime } = getDefaultTimes(date);
                                  newRowsToAdd.push({
                                    uid: user.uid,
                                    name: user.name,
                                    designation: user.designation,
                                    payScale: user.payScale,
                                    date: date,
                                    fromTime,
                                    toTime,
                                    isGazettedHoliday: false
                                  });
                                });
                              }
                            });

                            if (newRowsToAdd.length > 0) {
                              const updatedArr = [...selectedUserTimes, ...newRowsToAdd];
                              const userOrderMap = new Map();
                              updatedArr.forEach((su, index) => {
                                if (!userOrderMap.has(su.uid)) {
                                  userOrderMap.set(su.uid, index);
                                }
                              });
                              updatedArr.sort((a, b) => {
                                const orderA = userOrderMap.get(a.uid);
                                const orderB = userOrderMap.get(b.uid);
                                if (orderA !== orderB) return orderA - orderB;
                                return a.date.localeCompare(b.date);
                              });
                              setSelectedUserTimes(updatedArr);
                            }
                          }}
                        >
                          <option value="">Select a department to add all...</option>
                          {Array.from(new Set(allUsers.map(u => u.department).filter(Boolean)))
                            .filter(dept => isAdmin || !profile?.department || dept === profile.department)
                            .sort()
                            .map(dept => (
                              <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
                      </div>
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
                              <th className="px-4 py-3 w-24 text-center">Gazetted</th>
                              <th className="px-4 py-3 w-20 text-right">Actions</th>
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
                                <td className="px-4 py-3 text-center">
                                  <input 
                                    type="checkbox" 
                                    checked={!!su.isGazettedHoliday} 
                                    onChange={e => {
                                      const newArr = [...selectedUserTimes];
                                      newArr[idx].isGazettedHoliday = e.target.checked;
                                      setSelectedUserTimes(newArr);
                                    }}
                                    className="w-4 h-4 text-blue-600 rounded"
                                  />
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => {
                                      const newArr = selectedUserTimes.map((item, i) => {
                                        if (i > idx) {
                                          return {
                                            ...item,
                                            fromTime: su.fromTime,
                                            toTime: su.toTime,
                                            isGazettedHoliday: su.isGazettedHoliday
                                          };
                                        }
                                        return item;
                                      });
                                      setSelectedUserTimes(newArr);
                                    }} className="text-blue-500 hover:text-blue-700 p-1" title="Copy time & holiday status to all below">
                                      <Copy className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => {
                                      const newArr = [...selectedUserTimes];
                                      newArr.splice(idx, 1);
                                      setSelectedUserTimes(newArr);
                                    }} className="text-red-400 hover:text-red-600 p-1" title="Remove">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
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
                        {Object.entries<OvertimeEntry[]>(
                          entries.reduce((acc, entry) => {
                            const uid = entry.userId || 'unknown';
                            if (!acc[uid]) acc[uid] = [];
                            acc[uid].push(entry);
                            return acc;
                          }, {} as Record<string, OvertimeEntry[]>)
                        ).map(([uid, userEntries]) => (
                          <React.Fragment key={uid}>
                            {userEntries.map((entry, idx) => {
                              const globalIdx = entries.indexOf(entry);
                              return (
                                <tr key={globalIdx} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3 font-bold text-blue-700">{entry.userName}</td>
                                  <td className="px-4 py-3 font-medium">{entry.date}</td>
                                  <td className="px-4 py-3">{entry.day}</td>
                                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{entry.natureOfDuty}</td>
                                  <td className="px-4 py-3 text-xs font-mono">{entry.fromTime} - {entry.toTime}</td>
                                  <td className="px-4 py-3 font-semibold">{entry.hours}</td>
                                  <td className="px-4 py-3 font-bold text-blue-600">Rs. {entry.amount}</td>
                                  <td className="px-4 py-3 text-right">
                                    <button onClick={() => handleRemoveEntry(globalIdx)} className="text-red-400 hover:text-red-600 p-1">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                            <tr className="bg-blue-50/50 font-bold border-t-2 border-blue-100">
                              <td colSpan={5} className="px-4 py-3 text-right uppercase text-xs tracking-wider text-blue-800">Total for {userEntries[0].userName}</td>
                              <td className="px-4 py-3 text-blue-900">{userEntries.reduce((s, e) => s + e.hours, 0)}</td>
                              <td className="px-4 py-3 text-blue-700">Rs. {userEntries.reduce((s, e) => s + e.amount, 0)}</td>
                              <td></td>
                            </tr>
                          </React.Fragment>
                        ))}
                        {entries.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-4 py-12 text-center text-gray-400 italic">No entries added yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {entries.length > 0 && (
                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end items-center">
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
                        <Button variant="outline" onClick={() => generateOvertimePDF(profile || { name: user.displayName || user.email?.split('@')[0] }, claim)} className="p-2" title="Download PDF">
                          <Download className="w-5 h-5 text-red-500" />
                        </Button>
                        <Button variant="outline" onClick={() => generateOvertimeExcel(profile || { name: user.displayName || user.email?.split('@')[0] }, claim)} className="p-2" title="Download Excel">
                          <Download className="w-5 h-5 text-green-600" />
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
