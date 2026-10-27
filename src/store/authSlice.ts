import {createSlice, PayloadAction} from '@reduxjs/toolkit'
import { User } from '@/types'

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    authModalOpen: boolean;
    authModalMode: 'login' | 'register' | 'forgot';
}

const initialState: AuthState = {
  user: {
    id: 'USR-8888',
    username: '童趣小达人',
    email: 'parent@toyland.com',
    phone: '+971 50 123 4567',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=toyland',
  },
  isAuthenticated: true,
  authModalOpen: false,
  authModalMode: 'login',
};

export const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        setUser: (state, action: PayloadAction<User | null>) => {
            state.user = action.payload;
            state.isAuthenticated = !!action.payload
        },
        setAuthModalOpen: (state, action: PayloadAction<boolean>) => {
            state.authModalOpen = action.payload
        },
        setAuthModalMode: (state, action: PayloadAction<'login' | 'register' | 'forgot'>) => {
            state.authModalMode = action.payload
        },
        logout: (state) => {
            state.user = null;
            state.isAuthenticated = false;
        }
    }
})

export const {setUser, setAuthModalOpen, setAuthModalMode, logout} = authSlice.actions
export default authSlice.reducer