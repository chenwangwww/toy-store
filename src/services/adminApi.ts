import { Toy } from "@/types";

export const adminApi = {
    getToys: async (): Promise<Toy[]> => {
        const res = await fetch('/api/admin/toys')
        if(!res.ok) throw new Error('获取失败')
        return res.json()
    },

    createToy: async (data: Partial<Toy>): Promise<Toy> => {
        const res = await fetch('/api/admin/toys', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        })
        if (!res.ok) throw new Error('创建失败')
        return res.json()
    },
    updateToy: async (id: string, data: Partial<Toy>): Promise<Toy> => {
    const res = await fetch(`/api/admin/toys/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('更新失败');
    return res.json();
  },

  deleteToy: async (id: string): Promise<void> => {
    const res = await fetch(`/api/admin/toys/${id}`, {
        method: 'DELETE'
    })
    if(!res.ok) throw new Error('删除失败')
  }
}