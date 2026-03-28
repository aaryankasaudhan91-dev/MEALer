
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole } from '../types';
import { storage } from '../services/storageService';
import { verifyVolunteerId, verifyRequesterDocument } from '../services/geminiService';
import { reverseGeocodeGoogle, getCurrentLocation } from '../services/mapLoader';
import ScrollReveal from './ScrollReveal';
import { triggerHaptic } from '../services/haptics';
import {
    auth,
    googleProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    signInWithCustomToken
} from '../services/firebaseConfig';

interface LoginPageProps {
  onLogin: (user: User) => void;
  onShowStory?: () => void; // New Prop
}

const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
          } else {
              resolve(e.target?.result as string);
          }
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
};

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onShowStory }) => {
  const [view, setView] = useState<'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD' | 'FORGOT_OTP' | 'NEW_PASSWORD' | 'PHONE_LOGIN' | 'PHONE_OTP'>('LOGIN');
  const [isAnimating, setIsAnimating] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // --- LOGIN STATE ---
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // --- PHONE LOGIN / RECOVERY STATE ---
  const [phoneForAuth, setPhoneForAuth] = useState('');
  
  const [otp, setOtp] = useState('');

  // --- REGISTRATION OTP STATE (Specifically for Donor Verification) ---
  const [regOtp, setRegOtp] = useState('');
  const [isRegOtpSent, setIsRegOtpSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);

  // --- REGISTER STATE ---
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regPhone, setRegPhone] = useState('');
  const [regRole, setRegRole] = useState<UserRole>(UserRole.DONOR);
  
  // Volunteer Specific Register State
  const [volIdType, setVolIdType] = useState<string>('aadhaar'); 
  const [isVerifyingId, setIsVerifyingId] = useState(false);
  const [idVerificationResult, setIdVerificationResult] = useState<{isValid: boolean, feedback: string} | null>(null);
  const idFileInputRef = useRef<HTMLInputElement>(null);

  // Requester (NGO) Specific Register State
  const [regOrgName, setRegOrgName] = useState('');
  const [reqDocType, setReqDocType] = useState('registration_cert');
  const [isVerifyingDoc, setIsVerifyingDoc] = useState(false);
  const [docVerificationResult, setDocVerificationResult] = useState<{isValid: boolean, feedback: string} | null>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // Donor Specific State
  const [donorType, setDonorType] = useState<'Individual' | 'Restaurant' | 'Corporate'>('Individual');

  // --- LOCATION STATE ---
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [pincode, setPincode] = useState('');
  const [latLng, setLatLng] = useState<{lat: number, lng: number} | undefined>(undefined);
  const [detectingLoc, setDetectingLoc] = useState(false);

  // --- UI STATE ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Auth mounted
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
      const { clientX, clientY } = e;
      const x = (clientX / window.innerWidth) * 20; 
      const y = (clientY / window.innerHeight) * 20;
      setMousePos({ x, y });
  };

  const switchView = (newView: 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD' | 'FORGOT_OTP' | 'NEW_PASSWORD' | 'PHONE_LOGIN' | 'PHONE_OTP') => {
    triggerHaptic('selection');
    setError('');
    setIsAnimating(true);
    setTimeout(() => {
      setView(newView);
      // Reset sensitive states on view change
      if (newView !== 'REGISTER') {
          setIdVerificationResult(null);
          setDocVerificationResult(null);
          setRegPassword('');
          setLine1('');
          setLine2('');
          setPincode('');
          setLatLng(undefined);
          setRegOtp('');
          setIsRegOtpSent(false);
          setIsPhoneVerified(false);
      }
      if (newView === 'PHONE_LOGIN') setPhoneForAuth('');
      if (newView === 'PHONE_OTP') setOtp('');
      setIsAnimating(false);
    }, 500);
  };

  const handleGoogleLogin = async () => {
      setError(''); setLoading(true);
      try {
          const result = await signInWithPopup(auth, googleProvider);
          const user = result.user;
          let appUser = await storage.getUser(user.uid);
          
          if (!appUser) {
              const allUsers = await storage.getUsers();
              appUser = allUsers.find(u => u.email === user.email);
              
              if (!appUser) {
                  setError("Verification required. Please create an account to get verified.");
                  triggerHaptic('error');
                  setLoading(false);
                  
                  await signOut(auth);
                  setRegEmail(user.email || '');
                  setRegName(user.displayName || '');
                  switchView('REGISTER');
                  return;
              }
          }
          triggerHaptic('success');
          onLogin(appUser);
      } catch (err: any) {
          console.error(err);
          setError(err.message || "Google Login Failed");
          triggerHaptic('error');
          setLoading(false);
      }
  };

  const handleSendPhoneOtp = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(''); setLoading(true);
      
      if (!phoneForAuth || phoneForAuth.length < 10) {
          setError("Enter a valid phone number");
          triggerHaptic('error');
          setLoading(false);
          return;
      }

      const formattedPhone = phoneForAuth.startsWith('+') ? phoneForAuth : `+91${phoneForAuth}`;

      try {
          const res = await fetch('/api/auth/send-otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: formattedPhone })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to send OTP");
          
          triggerHaptic('success');
          switchView('PHONE_OTP');
      } catch (err: any) {
          console.error(err);
          setError(err.message || "Failed to send OTP");
          triggerHaptic('error');
      } finally {
          setLoading(false);
      }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(''); setLoading(true);
      
      const formattedPhone = phoneForAuth.startsWith('+') ? phoneForAuth : `+91${phoneForAuth}`;
      try {
          const res = await fetch('/api/auth/verify-otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: formattedPhone, code: otp, isLoginPhase: true })
          });
          const data = await res.json();
          
          if (!res.ok) {
              if (res.status === 404) {
                   setError("Verification required. Please create an account to get verified.");
                   triggerHaptic('error');
                   setLoading(false);
                   await signOut(auth);
                   setRegPhone(phoneForAuth.replace('+91', ''));
                   switchView('REGISTER');
                   return;
              }
              throw new Error(data.error || "Invalid OTP");
          }

          // Mint custom token and sign into Firebase locally
          if (data.customToken) {
              await signInWithCustomToken(auth, data.customToken);
          }
          triggerHaptic('success');
          onLogin(data.user);
      } catch (err: any) {
          setError(err.message || "Invalid OTP");
          triggerHaptic('error');
          setLoading(false);
      }
  };

  // --- REGISTRATION OTP LOGIC ---
  const handleSendRegOtp = async () => {
      if (!regPhone || regPhone.length < 10) {
          setError("Enter a valid phone number first.");
          triggerHaptic('error');
          return;
      }
      setError('');
      
      const formattedPhone = regPhone.startsWith('+') ? regPhone : `+91${regPhone}`;
      
      try {
          const res = await fetch('/api/auth/send-otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: formattedPhone })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to send OTP");
          
          setIsRegOtpSent(true);
          triggerHaptic('success');
      } catch (err: any) {
          console.error(err);
          setError(err.message || "Failed to send OTP. Try again.");
          triggerHaptic('error');
      }
  };

  const handleVerifyRegOtp = async () => {
      if (!regOtp || regOtp.length < 6) return;
      const formattedPhone = regPhone.startsWith('+') ? regPhone : `+91${regPhone}`;
      try {
          const res = await fetch('/api/auth/verify-otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: formattedPhone, code: regOtp, isLoginPhase: false })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Invalid OTP");
          
          setIsPhoneVerified(true);
          setIsRegOtpSent(false);
          triggerHaptic('success');
      } catch (err: any) {
          setError(err.message || "Invalid OTP");
          triggerHaptic('error');
      }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
        const userCredential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
        const firebaseUser = userCredential.user;
        
        let existingUser = await storage.getUser(firebaseUser.uid);
        
        // If not found by UID, try fallback to email match (mostly for handling simulation edge cases)
        if (!existingUser) { 
            const users = await storage.getUsers(); 
            existingUser = users.find(u => u.email === firebaseUser.email); 
        }
        
        if (!existingUser) { 
            setLoading(false); 
            setError("Account not found in database. Please Sign Up."); 
            triggerHaptic('error'); 
            return; 
        }
        
        triggerHaptic('success');
        onLogin(existingUser);
    } catch (err: any) { 
        setLoading(false); 
        // Show specific error message from Firebase
        const msg = err.message || "Login failed. Please check your credentials.";
        // Clean up common firebase error codes for better UX
        const cleanMsg = msg.replace('Firebase: ', '').replace('auth/', '');
        setError(cleanMsg); 
        triggerHaptic('error'); 
    }
  };

  // --- SECURE REGISTRATION LOGIC ---

  const handleAutoDetectLocation = async () => {
    setDetectingLoc(true);
    triggerHaptic('impactLight');
    
    try {
        const pos = await getCurrentLocation();
        const { lat, lng } = pos;
        
        setLatLng({ lat, lng });
        triggerHaptic('success');
        
        const address = await reverseGeocodeGoogle(lat, lng);
        if (address) {
            setLine1(address.line1);
            setLine2(address.line2);
            setPincode(address.pincode);
        }
    } catch (error: any) {
        alert(error.message || "Could not detect location.");
        triggerHaptic('error');
    } finally {
        setDetectingLoc(false);
    }
  };

  const handleIdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; 
      if (!file) return;
      
      setIsVerifyingId(true); 
      setIdVerificationResult(null);
      setError('');
      triggerHaptic('impactMedium');

      try {
          const base64 = await resizeImage(file);
          
          // Verify with Gemini
          const result = await verifyVolunteerId(base64, volIdType);
          setIdVerificationResult(result);
          
          if (!result.isValid) {
              setError(result.feedback || "ID verification failed. Please try a clearer image.");
              triggerHaptic('error');
          } else {
              triggerHaptic('success');
          }
      } catch (err) { 
          setError("Failed to verify ID."); 
          triggerHaptic('error');
      } finally { 
          setIsVerifyingId(false); 
      }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (!regOrgName) {
          alert("Please enter Organization Name first.");
          return;
      }

      setIsVerifyingDoc(true);
      setDocVerificationResult(null);
      setError('');
      triggerHaptic('impactMedium');

      try {
          const base64 = await resizeImage(file);
          // Verify with Gemini
          const result = await verifyRequesterDocument(base64, reqDocType, regOrgName);
          setDocVerificationResult(result);

          if (!result.isValid) {
              setError(result.feedback || "Document verification failed.");
              triggerHaptic('error');
          } else {
              triggerHaptic('success');
          }
      } catch (err) {
          setError("Failed to verify document.");
          triggerHaptic('error');
      } finally {
          setIsVerifyingDoc(false);
      }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); 
    
    // Basic Validation
    if (!regName || !regEmail || !regPassword || !regPhone) { setError("Fill all fields"); triggerHaptic('error'); return; }
    if (regPassword.length < 8) { setError("Password must be at least 8 characters"); triggerHaptic('error'); return; }
    if (!line1 || !pincode) { setError("Please provide your address"); triggerHaptic('error'); return; }

    // Security Gates based on Role
    let isRoleVerified = false;
    let extraData: any = {};

    if (regRole === UserRole.VOLUNTEER) {
        if (!idVerificationResult?.isValid) {
            setError("Valid Government ID is required for Volunteers.");
            triggerHaptic('error');
            return;
        }
        isRoleVerified = true;
        extraData.volunteerCategory = 'Individual';
        extraData.volunteerIdType = volIdType;
        // In real app, upload image to storage and save URL
    } else if (regRole === UserRole.REQUESTER) {
        if (!regOrgName) { setError("Organization Name is required."); triggerHaptic('error'); return; }
        if (!docVerificationResult?.isValid) {
            setError("Valid Registration Document is required for Requesters.");
            triggerHaptic('error');
            return;
        }
        isRoleVerified = true;
        extraData.orgName = regOrgName;
        extraData.requesterType = 'Orphanage'; // Default or add dropdown
    } else {
        // Donor Logic
        if (donorType !== 'Individual' && !regOrgName) {
            setError("Organization Name is required."); triggerHaptic('error'); return;
        }
        // Strict Check for Donor Phone Verification
        if (!isPhoneVerified) {
            setError("Please verify your phone number via OTP.");
            triggerHaptic('error');
            return;
        }
        isRoleVerified = true; // Phone verified
        extraData.donorType = donorType;
        extraData.orgName = donorType !== 'Individual' ? regOrgName : '';
    }

    setLoading(true);
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
        
        // Send Email Verification for Donors (and others optionally)
        await sendEmailVerification(userCredential.user);
        alert(`Account created! A verification email has been sent to ${regEmail}. Please check your inbox.`);

        const newUser = {
            id: userCredential.user.uid,
            name: regName, 
            email: regEmail, 
            contactNo: regPhone, 
            role: regRole,
            address: { line1, line2, pincode, lat: latLng?.lat, lng: latLng?.lng },
            isVerified: isRoleVerified, 
            impactScore: 0, 
            averageRating: 5,
            ...extraData
        };
        await storage.saveUser(newUser as User);
        triggerHaptic('success');
        onLogin(newUser as User);
    } catch(err:any) { 
        setLoading(false); 
        // Show cleaner error message for registration failures too
        const cleanMsg = (err.message || "Registration failed").replace('Firebase: ', '').replace('auth/', '');
        setError(cleanMsg); 
        triggerHaptic('error');
    }
  };

  const renderPasswordToggle = (show: boolean, setShow: (val: boolean) => void) => (
      <button type="button" onClick={() => setShow(!show)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none text-xs font-bold uppercase tracking-wider">
          {show ? "Hide" : "Show"}
      </button>
  );

  const renderIdExample = (type: string) => {
      // Helper to return visual cues based on ID type
      if(type === 'aadhaar') return (
          <div className="mt-4 mb-2 p-3 bg-white border border-slate-200 rounded-xl shadow-sm opacity-80 pointer-events-none select-none">
              <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-1">
                  <div className="w-6 h-4 bg-orange-400 rounded-sm"></div>
                  <div className="text-[8px] font-bold text-slate-400">GOVT OF INDIA</div>
              </div>
              <div className="flex gap-2">
                  <div className="w-8 h-10 bg-slate-200 rounded-md"></div>
                  <div className="flex-1 space-y-1">
                      <div className="h-1.5 w-16 bg-slate-200 rounded"></div>
                      <div className="h-1.5 w-12 bg-slate-200 rounded"></div>
                      <div className="h-2 w-24 bg-slate-300 rounded mt-1"></div>
                  </div>
              </div>
              <div className="mt-2 text-center text-[8px] font-bold text-slate-500 tracking-widest">
                  XXXX XXXX XXXX
              </div>
          </div>
      );
      if(type === 'pan') return (
          <div className="mt-4 mb-2 p-3 bg-blue-50 border border-blue-200 rounded-xl shadow-sm opacity-80 pointer-events-none select-none relative overflow-hidden">
              <div className="absolute top-2 right-2 text-[6px] font-bold text-blue-300">INCOME TAX</div>
              <div className="flex gap-2 items-center">
                  <div className="w-8 h-8 bg-blue-200 rounded-full"></div>
                  <div className="flex-1">
                      <div className="text-[7px] font-bold text-blue-800">PERMANENT ACCOUNT NUMBER</div>
                      <div className="text-xs font-black text-blue-900 tracking-widest mt-0.5">ABCDE1234F</div>
                  </div>
              </div>
          </div>
      );
      if(type === 'student_id') return (
          <div className="mt-4 mb-2 p-3 bg-white border border-slate-200 rounded-xl shadow-sm opacity-80 pointer-events-none select-none text-center">
              <div className="bg-indigo-600 h-6 w-full -mt-3 -mx-3 mb-2 rounded-t-xl w-[calc(100%+24px)] flex items-center justify-center text-white text-[8px] font-bold">UNIVERSITY NAME</div>
              <div className="w-10 h-10 bg-slate-200 rounded-full mx-auto mb-1 border-2 border-white shadow-sm"></div>
              <div className="h-2 w-16 bg-slate-200 rounded mx-auto mb-1"></div>
              <div className="text-[7px] font-bold text-slate-400">STUDENT ID: 123456</div>
          </div>
      );
      return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-6 font-sans overflow-hidden relative" onMouseMove={handleMouseMove}>
      <div id="recaptcha-container"></div>
      
      {/* Background Animated Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-slate-100 to-blue-50 animate-gradient-slow opacity-60 z-0"></div>

      <div className="w-full max-w-5xl bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[700px] animate-fade-in-up transition-all duration-500 border border-white/50 relative z-10">

        <div className="md:w-5/12 bg-slate-900 p-10 md:p-12 text-white flex flex-col justify-between relative overflow-hidden group">
            {/* Interactive Parallax Background Elements */}
            <div 
                className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl transition-transform duration-200 ease-out"
                style={{ transform: `translate(${mousePos.x}px, ${mousePos.y}px)` }}
            ></div>
            <div 
                className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl transition-transform duration-200 ease-out"
                style={{ transform: `translate(${-mousePos.x}px, ${-mousePos.y}px)` }}
            ></div>

            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-12">
                    <div className="text-4xl filter drop-shadow-lg animate-bounce-slow">🍃</div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter leading-none">MEALers</h1>
                        <p className="text-slate-400 text-[10px] font-bold tracking-[0.3em] uppercase">Connect</p>
                    </div>
                </div>

                <div className={`transition-all duration-500 ${isAnimating ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
                    <ScrollReveal animation="fade-right" delay={100}>
                        <h2 className="text-4xl md:text-5xl font-black leading-tight mb-6 tracking-tight">
                            {view === 'LOGIN' || view === 'PHONE_LOGIN' || view === 'PHONE_OTP' ? 'Welcome Back.' :
                            view === 'REGISTER' ? 'Join the Mission.' :
                            'Secure Access.'}
                        </h2>
                    </ScrollReveal>
                    <ScrollReveal animation="fade-right" delay={200}>
                        <p className="text-slate-400 font-medium text-lg leading-relaxed max-w-xs">
                            {view === 'LOGIN' 
                                ? 'Connect to rescue food, feed communities, and create impact.'
                                : 'Create an account to become a food donor, volunteer, or beneficiary.'}
                        </p>
                    </ScrollReveal>
                </div>
            </div>

            <div className="relative z-10 mt-auto pt-8">
                 {/* Story Button */}
                 {onShowStory && (
                    <button 
                        onClick={() => { triggerHaptic('selection'); onShowStory(); }}
                        className="mb-6 flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl p-4 transition-all w-full border border-white/10 group"
                    >
                        <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-xl shadow-lg group-hover:scale-110 transition-transform">📖</div>
                        <div className="text-left">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">New here?</p>
                            <p className="font-bold text-sm">Read Our Story</p>
                        </div>
                    </button>
                 )}

                 <div className="flex -space-x-3 mb-4 pl-2">
                    {[1,2,3,4].map(i => (
                        <div key={i} className={`w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-xs font-bold ring-2 ring-slate-900 transition-transform hover:-translate-y-1 hover:z-10 cursor-default`}>
                             {String.fromCharCode(64+i)}
                        </div>
                    ))}
                    <div className="w-10 h-10 rounded-full border-2 border-slate-900 bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-xs font-bold ring-2 ring-slate-900 shadow-lg shadow-emerald-500/20">+2k</div>
                 </div>
                 <p className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Join thousands of food heroes today.
                 </p>
            </div>
        </div>

        <div className="md:w-7/12 p-8 md:p-12 overflow-y-auto custom-scrollbar relative bg-white/50 flex flex-col">
            <div className={`transition-all duration-500 transform ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} flex-1`}>

            {view === 'LOGIN' && (
                <div className="max-w-sm mx-auto mt-4">
                    <ScrollReveal delay={100} animation="fade-up">
                        <h3 className="text-2xl font-black text-slate-800 mb-8">Sign In</h3>
                    </ScrollReveal>
                    <form onSubmit={handleLoginSubmit} className="space-y-5">
                        <ScrollReveal delay={200} animation="fade-up">
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                                <input
                                    type="email"
                                    value={loginEmail}
                                    onChange={e => setLoginEmail(e.target.value)}
                                    placeholder="name@example.com"
                                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:bg-white transition-all hover:bg-slate-100"
                                />
                            </div>
                        </ScrollReveal>

                        <ScrollReveal delay={300} animation="fade-up">
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                                <div className="relative">
                                    <input
                                        type={showLoginPassword ? "text" : "password"}
                                        value={loginPassword}
                                        onChange={e => setLoginPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full pl-5 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:bg-white transition-all hover:bg-slate-100"
                                    />
                                    {renderPasswordToggle(showLoginPassword, setShowLoginPassword)}
                                </div>
                                <div className="text-right">
                                    <button type="button" onClick={() => switchView('FORGOT_PASSWORD')} className="text-[10px] font-bold text-slate-400 hover:text-emerald-600 transition-colors uppercase tracking-wider">Forgot Password?</button>
                                </div>
                            </div>
                        </ScrollReveal>

                        {error && (
                            <div className="animate-fade-in-up p-3 bg-rose-50 rounded-xl flex items-center gap-3 border border-rose-100">
                                <p className="text-rose-600 text-xs font-bold leading-tight">{error}</p>
                            </div>
                        )}

                        <ScrollReveal delay={400} animation="scale-up">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-slate-200 hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-2xl transition-all disabled:opacity-70 disabled:transform-none flex justify-center items-center gap-3"
                            >
                                {loading && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>}
                                Sign In
                            </button>
                        </ScrollReveal>
                    </form>

                    <div className="my-8 flex items-center gap-4 opacity-50">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Or Continue With</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <ScrollReveal delay={450} animation="fade-up">
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <button 
                                onClick={handleGoogleLogin} 
                                disabled={loading}
                                className="flex items-center justify-center gap-3 py-4 rounded-2xl border-2 border-slate-100 hover:border-blue-100 hover:bg-blue-50 transition-all group"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                <span className="font-bold text-sm text-slate-600 group-hover:text-blue-700">Google</span>
                            </button>
                            <button 
                                onClick={() => switchView('PHONE_LOGIN')} 
                                disabled={loading}
                                className="flex items-center justify-center gap-3 py-4 rounded-2xl border-2 border-slate-100 hover:border-slate-300 hover:bg-slate-100 transition-all group"
                            >
                                <svg className="w-5 h-5 text-slate-500 group-hover:text-slate-800" fill="currentColor" viewBox="0 0 20 20"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"></path></svg>
                                <span className="font-bold text-sm text-slate-600 group-hover:text-slate-800">Phone</span>
                            </button>
                        </div>
                    </ScrollReveal>

                    <ScrollReveal delay={500} animation="fade-up">
                        <button
                            type="button"
                            onClick={() => switchView('REGISTER')}
                            className="w-full bg-white text-slate-600 font-bold py-4 rounded-2xl border-2 border-slate-100 hover:border-emerald-200 hover:text-emerald-700 hover:bg-emerald-50 transition-all flex items-center justify-center gap-3 disabled:opacity-70 group"
                        >
                            Create an Account
                        </button>
                    </ScrollReveal>
                </div>
            )}

            {/* REGISTER VIEW - ENHANCED SECURITY */}
            {view === 'REGISTER' && (
                 <div className="max-w-md mx-auto">
                    <ScrollReveal delay={100} animation="fade-up">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-black text-slate-800">Create Account</h3>
                            <button onClick={() => switchView('LOGIN')} className="text-xs font-bold text-slate-400 hover:text-slate-600">Back to Login</button>
                        </div>
                    </ScrollReveal>
                    
                    <form onSubmit={handleRegister} className="space-y-6">
                        {/* Role Selector */}
                        <ScrollReveal delay={150} animation="fade-up">
                            <div className="bg-slate-50 p-1.5 rounded-2xl flex border border-slate-100">
                                {[UserRole.DONOR, UserRole.VOLUNTEER, UserRole.REQUESTER].map(role => (
                                    <button key={role} type="button" onClick={() => { setRegRole(role); triggerHaptic('selection'); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${regRole === role ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>{role}</button>
                                ))}
                            </div>
                        </ScrollReveal>

                        {/* Basic Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <ScrollReveal delay={200} animation="fade-up">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Name</label>
                                    <input value={regName} onChange={e => setRegName(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:outline-none focus:ring-4 focus:ring-emerald-100 transition-all" required />
                                </div>
                            </ScrollReveal>
                            <ScrollReveal delay={250} animation="fade-up">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Phone</label>
                                    <div className="relative">
                                        <input 
                                            value={regPhone} 
                                            onChange={e => setRegPhone(e.target.value.replace(/\D/g,''))} 
                                            maxLength={10} 
                                            className="w-full pl-5 pr-20 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:outline-none focus:ring-4 focus:ring-emerald-100 transition-all" 
                                            required 
                                        />
                                        {/* Phone Verification Button for Donors */}
                                        {regRole === UserRole.DONOR && !isPhoneVerified && (
                                            <button 
                                                type="button"
                                                onClick={handleSendRegOtp}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-2 rounded-xl"
                                            >
                                                Verify
                                            </button>
                                        )}
                                        {isPhoneVerified && regRole === UserRole.DONOR && (
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500">
                                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* OTP Field for Registration */}
                                    {isRegOtpSent && !isPhoneVerified && (
                                        <div className="mt-2 flex gap-2 animate-fade-in-up">
                                            <input 
                                                type="text" 
                                                value={regOtp} 
                                                onChange={e => setRegOtp(e.target.value.replace(/\D/g,''))} 
                                                maxLength={6} 
                                                placeholder="Enter OTP" 
                                                className="flex-1 px-4 py-2 border border-slate-200 rounded-xl font-bold text-sm focus:outline-none"
                                            />
                                            <button 
                                                type="button" 
                                                onClick={handleVerifyRegOtp}
                                                className="bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold text-xs uppercase"
                                            >
                                                Confirm
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </ScrollReveal>
                        </div>

                        {/* Address Section */}
                        <ScrollReveal delay={270} animation="fade-up">
                            <div className="space-y-3 pt-2">
                                <div className="flex justify-between items-end">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Location & Address</label>
                                    <button 
                                        type="button" 
                                        onClick={handleAutoDetectLocation} 
                                        className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 hover:text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
                                        disabled={detectingLoc}
                                    >
                                        {detectingLoc ? (
                                            <><div className="animate-spin h-3 w-3 border-2 border-emerald-600 border-t-transparent rounded-full"></div> Detecting...</>
                                        ) : (
                                            <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Auto Detect</>
                                        )}
                                    </button>
                                </div>
                                <input 
                                    value={line1} 
                                    onChange={e => setLine1(e.target.value)} 
                                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:outline-none focus:ring-4 focus:ring-emerald-100 transition-all placeholder:text-slate-300 text-sm" 
                                    placeholder="Flat / House No / Building" 
                                    required 
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <input 
                                        value={line2} 
                                        onChange={e => setLine2(e.target.value)} 
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:outline-none focus:ring-4 focus:ring-emerald-100 transition-all placeholder:text-slate-300 text-sm" 
                                        placeholder="Area / Street" 
                                        required 
                                    />
                                    <input 
                                        value={pincode} 
                                        onChange={e => setPincode(e.target.value.replace(/\D/g,''))} 
                                        maxLength={6} 
                                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:outline-none focus:ring-4 focus:ring-emerald-100 transition-all placeholder:text-slate-300 text-sm" 
                                        placeholder="Pincode" 
                                        required 
                                    />
                                </div>
                            </div>
                        </ScrollReveal>

                        {/* --- SECURE ROLE SPECIFIC FIELDS --- */}
                        
                        {/* 1. DONOR SPECIFICS */}
                        {regRole === UserRole.DONOR && (
                            <ScrollReveal delay={280} animation="fade-up">
                                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                                    <div className="flex gap-2 mb-3">
                                        <button type="button" onClick={() => setDonorType('Individual')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-lg border ${donorType === 'Individual' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-200'}`}>Individual</button>
                                        <button type="button" onClick={() => setDonorType('Restaurant')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-lg border ${donorType === 'Restaurant' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-200'}`}>Restaurant</button>
                                        <button type="button" onClick={() => setDonorType('Corporate')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-lg border ${donorType === 'Corporate' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-500 border-slate-200'}`}>Corporate</button>
                                    </div>
                                    {donorType !== 'Individual' && (
                                        <div className="space-y-1">
                                            <label className="text-xs font-black text-blue-800 uppercase tracking-widest ml-1">Organization Name</label>
                                            <input value={regOrgName} onChange={e => setRegOrgName(e.target.value)} className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl font-bold text-sm focus:outline-none" placeholder="e.g. Fresh Bites Ltd." required />
                                        </div>
                                    )}
                                </div>
                            </ScrollReveal>
                        )}

                        {/* 2. VOLUNTEER SPECIFICS - ID VERIFICATION */}
                        {regRole === UserRole.VOLUNTEER && (
                            <ScrollReveal delay={280} animation="fade-up">
                                <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 space-y-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-lg">🛡️</span>
                                        <h4 className="font-black text-amber-900 text-xs uppercase tracking-wider">Identity Verification</h4>
                                    </div>
                                    
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-amber-800 uppercase tracking-widest ml-1">ID Type</label>
                                        <select value={volIdType} onChange={e => setVolIdType(e.target.value)} className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl font-bold text-xs text-slate-700 focus:outline-none">
                                            <option value="aadhaar">Aadhaar Card</option>
                                            <option value="pan">PAN Card</option>
                                            <option value="driving_license">Driving License</option>
                                            <option value="student_id">Student ID</option>
                                        </select>
                                    </div>

                                    {renderIdExample(volIdType)}

                                    <div className="relative">
                                        <input type="file" ref={idFileInputRef} className="hidden" accept="image/*" onChange={handleIdUpload} />
                                        <button 
                                            type="button" 
                                            onClick={() => idFileInputRef.current?.click()}
                                            disabled={isVerifyingId || !!idVerificationResult?.isValid}
                                            className={`w-full py-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all ${idVerificationResult?.isValid ? 'border-emerald-400 bg-emerald-50' : 'border-amber-300 bg-white hover:bg-amber-50'}`}
                                        >
                                            {isVerifyingId ? (
                                                <span className="text-amber-600 font-bold text-xs animate-pulse">Verifying ID with AI...</span>
                                            ) : idVerificationResult?.isValid ? (
                                                <div className="flex items-center gap-2 text-emerald-700">
                                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                                    <span className="font-bold text-xs uppercase tracking-wider">ID Verified</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="text-2xl mb-1">📸</span>
                                                    <span className="text-amber-800 font-bold text-xs uppercase tracking-wider">Upload {volIdType.replace('_', ' ')}</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    {idVerificationResult && !idVerificationResult.isValid && (
                                        <p className="text-[10px] font-bold text-rose-500 bg-rose-50 p-2 rounded-lg border border-rose-100">{idVerificationResult.feedback}</p>
                                    )}
                                </div>
                            </ScrollReveal>
                        )}

                        {/* 3. REQUESTER SPECIFICS - DOC VERIFICATION */}
                        {regRole === UserRole.REQUESTER && (
                            <ScrollReveal delay={280} animation="fade-up">
                                <div className="p-5 bg-purple-50 rounded-2xl border border-purple-100 space-y-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-lg">🏛️</span>
                                        <h4 className="font-black text-purple-900 text-xs uppercase tracking-wider">Organization Proof</h4>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-purple-800 uppercase tracking-widest ml-1">Organization Name</label>
                                        <input value={regOrgName} onChange={e => setRegOrgName(e.target.value)} className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl font-bold text-sm focus:outline-none" placeholder="e.g. Hope Orphanage" required />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-purple-800 uppercase tracking-widest ml-1">Document Type</label>
                                        <select value={reqDocType} onChange={e => setReqDocType(e.target.value)} className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl font-bold text-xs text-slate-700 focus:outline-none">
                                            <option value="registration_cert">Registration Certificate</option>
                                            <option value="ngo_darpan">NGO Darpan ID</option>
                                            <option value="org_pan">Organization PAN</option>
                                            <option value="jj_act">JJ Act Registration</option>
                                        </select>
                                    </div>

                                    <div className="relative">
                                        <input type="file" ref={docFileInputRef} className="hidden" accept="image/*" onChange={handleDocUpload} />
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                if(!regOrgName) alert("Enter Organization Name first");
                                                else docFileInputRef.current?.click();
                                            }}
                                            disabled={isVerifyingDoc || !!docVerificationResult?.isValid}
                                            className={`w-full py-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all ${docVerificationResult?.isValid ? 'border-emerald-400 bg-emerald-50' : 'border-purple-300 bg-white hover:bg-purple-50'}`}
                                        >
                                            {isVerifyingDoc ? (
                                                <span className="text-purple-600 font-bold text-xs animate-pulse">Verifying Document...</span>
                                            ) : docVerificationResult?.isValid ? (
                                                <div className="flex items-center gap-2 text-emerald-700">
                                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                                    <span className="font-bold text-xs uppercase tracking-wider">Verified</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="text-2xl mb-1">📄</span>
                                                    <span className="text-purple-800 font-bold text-xs uppercase tracking-wider">Upload Proof</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    {docVerificationResult && !docVerificationResult.isValid && (
                                        <p className="text-[10px] font-bold text-rose-500 bg-rose-50 p-2 rounded-lg border border-rose-100">{docVerificationResult.feedback}</p>
                                    )}
                                </div>
                            </ScrollReveal>
                        )}

                        <ScrollReveal delay={300} animation="fade-up">
                             <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                                <input value={regEmail} onChange={e => setRegEmail(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:outline-none focus:ring-4 focus:ring-emerald-100 transition-all" required />
                            </div>
                        </ScrollReveal>

                        <ScrollReveal delay={350} animation="fade-up">
                             <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                                <div className="relative">
                                    <input type={showRegPassword ? "text" : "password"} value={regPassword} onChange={e => setRegPassword(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:outline-none focus:ring-4 focus:ring-emerald-100 transition-all" required />
                                    {renderPasswordToggle(showRegPassword, setShowRegPassword)}
                                </div>
                                {regPassword && regPassword.length < 8 && (
                                    <p className="text-[10px] text-rose-500 font-bold mt-1 ml-1">Must be at least 8 characters</p>
                                )}
                            </div>
                        </ScrollReveal>

                        {error && (
                            <div className="animate-fade-in-up p-3 bg-rose-50 rounded-xl flex items-center gap-3 border border-rose-100">
                                <p className="text-rose-600 text-xs font-bold leading-tight">{error}</p>
                            </div>
                        )}

                        <ScrollReveal delay={450} animation="scale-up">
                            <button 
                                type="submit" 
                                disabled={loading || 
                                    (regRole === UserRole.VOLUNTEER && !idVerificationResult?.isValid) ||
                                    (regRole === UserRole.REQUESTER && !docVerificationResult?.isValid) ||
                                    (regRole === UserRole.DONOR && !isPhoneVerified)
                                } 
                                className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            >
                                {loading ? (
                                    <><div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div> Creating...</>
                                ) : 'Register Securely'}
                            </button>
                        </ScrollReveal>
                    </form>
                 </div>
            )}

            {view === 'PHONE_LOGIN' && (
                <div className="max-w-sm mx-auto mt-4">
                    <ScrollReveal delay={100} animation="fade-up">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-black text-slate-800">Phone Login</h3>
                            <button onClick={() => switchView('LOGIN')} className="text-xs font-bold text-slate-400 hover:text-slate-600">Back</button>
                        </div>
                    </ScrollReveal>
                    
                    <form onSubmit={handleSendPhoneOtp} className="space-y-6">
                        <ScrollReveal delay={200} animation="fade-up">
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Mobile Number</label>
                                <div className="flex">
                                    <span className="inline-flex items-center px-4 rounded-l-2xl border border-r-0 border-slate-200 bg-slate-50 text-slate-500 font-bold text-sm">+91</span>
                                    <input 
                                        type="tel" 
                                        value={phoneForAuth} 
                                        onChange={e => setPhoneForAuth(e.target.value.replace(/\D/g,''))} 
                                        maxLength={10}
                                        placeholder="98765 43210" 
                                        className="w-full px-5 py-4 border border-slate-200 rounded-r-2xl font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-100 transition-all"
                                        autoFocus
                                    />
                                </div>
                            </div>
                        </ScrollReveal>

                        {error && (
                            <div className="animate-fade-in-up p-3 bg-rose-50 rounded-xl flex items-center gap-3 border border-rose-100">
                                <p className="text-rose-600 text-xs font-bold leading-tight">{error}</p>
                            </div>
                        )}

                        <ScrollReveal delay={300} animation="scale-up">
                            <button
                                type="submit"
                                disabled={loading || phoneForAuth.length < 10}
                                className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all disabled:opacity-70 flex justify-center items-center gap-3"
                            >
                                {loading && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>}
                                Send OTP
                            </button>
                        </ScrollReveal>
                    </form>
                </div>
            )}

            {view === 'PHONE_OTP' && (
                <div className="max-w-sm mx-auto mt-4">
                    <ScrollReveal delay={100} animation="fade-up">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-black text-slate-800">Verify OTP</h3>
                            <button onClick={() => switchView('PHONE_LOGIN')} className="text-xs font-bold text-slate-400 hover:text-slate-600">Change Number</button>
                        </div>
                    </ScrollReveal>
                    
                    <form onSubmit={handleVerifyPhoneOtp} className="space-y-6">
                        <div className="space-y-1">
                            <p className="text-xs text-slate-500 mb-4">Enter the 6-digit code sent to <span className="font-bold text-slate-800">+91 {phoneForAuth}</span></p>
                            <input 
                                type="text" 
                                value={otp} 
                                onChange={e => setOtp(e.target.value.replace(/\D/g,''))} 
                                maxLength={6}
                                placeholder="123456" 
                                className="w-full px-5 py-4 border border-slate-200 rounded-2xl font-bold text-slate-800 text-center text-xl tracking-[0.5em] focus:outline-none focus:ring-4 focus:ring-emerald-100 transition-all"
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div className="animate-fade-in-up p-3 bg-rose-50 rounded-xl flex items-center gap-3 border border-rose-100">
                                <p className="text-rose-600 text-xs font-bold leading-tight">{error}</p>
                            </div>
                        )}

                        <ScrollReveal delay={200} animation="scale-up">
                            <button
                                type="submit"
                                disabled={loading || otp.length < 6}
                                className="w-full bg-emerald-500 text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-emerald-200 hover:bg-emerald-600 transition-all disabled:opacity-70 flex justify-center items-center gap-3"
                            >
                                {loading && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>}
                                Verify & Login
                            </button>
                        </ScrollReveal>
                    </form>
                </div>
            )}

            </div>

            <div className="mt-8 text-center">
                <p className="text-slate-300 text-[10px] font-black uppercase tracking-widest">
                    &copy; {new Date().getFullYear()} MEALers connect
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};
