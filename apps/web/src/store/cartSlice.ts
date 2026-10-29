import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Toy } from "@toy-store/shared";

export interface CartItem {
    toy: Toy;
    quantity: number;
}

interface CartState {
    items: CartItem[];
}

const initialState: CartState = {
    items: []
}

export const cartSlice = createSlice({
    name: 'cart',
    initialState,
    reducers: {
        addToCart: (state, action: PayloadAction<{ toy: Toy; quantity?: number }>) => {
            const { toy, quantity = 1 } = action.payload
            const existing = state.items.find(item => item.toy.id === toy.id)
            if (existing) {
                existing.quantity += quantity
            } else {
                state.items.push({ toy, quantity })
            }
        },
        removeFromCart: (state, action: PayloadAction<string>) => {
            state.items = state.items.filter(item => item.toy.id !== action.payload)
        },
        updateQuantity: (state, action: PayloadAction<{ id: string; quantity: number }>) => {
            const item = state.items.find(i => i.toy.id === action.payload.id);
            if (item) {
                item.quantity = Math.max(1, action.payload.quantity);
            }
        },
        clearCart: (state) => {
            state.items = []
        }
    }
})

export const {addToCart, removeFromCart, updateQuantity, clearCart} = cartSlice.actions
export default cartSlice.reducer