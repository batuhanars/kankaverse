import http from './http';

// Sprint M1d-B (sözleşme §11) — kanal kategorileri.
// Uçlar `api/src/modules/categories/categories.controller.ts`'ten okundu:
//   POST   /guilds/:id/categories   (OWNER/ADMIN)  CreateCategoryDto { name 1-50 }
//   GET    /guilds/:id/categories   (üye)
//   PATCH  /categories/:id          (OWNER/ADMIN)
//   DELETE /categories/:id          (OWNER/ADMIN)
//   PATCH  /guilds/:id/categories/reorder (OWNER/ADMIN) — BAĞLANMADI (sürükle-sırala kapsam dışı)

/** Sunucu DTO'sundan yalnız kullanılan alt küme (M0'dan beri süren Rule of Three disiplini). */
export interface CategoryDto {
  id: string;
  name: string;
  position: number;
}

export const categoriesApi = {
  async listByGuild(guildId: string): Promise<CategoryDto[]> {
    const res = await http.get<CategoryDto[]>(`/guilds/${guildId}/categories`);
    return res.data;
  },

  async create(guildId: string, name: string): Promise<CategoryDto> {
    const res = await http.post<CategoryDto>(`/guilds/${guildId}/categories`, { name });
    return res.data;
  },

  async update(categoryId: string, name: string): Promise<CategoryDto> {
    const res = await http.patch<CategoryDto>(`/categories/${categoryId}`, { name });
    return res.data;
  },

  async remove(categoryId: string): Promise<null> {
    const res = await http.delete<null>(`/categories/${categoryId}`);
    return res.data;
  },
};
