export const supabase = {
  functions: {
    invoke: async () => ({ data: null, error: new Error("Local mode active") })
  },
  from: () => ({
    select: async () => ({ data: [], error: null }),
    insert: async () => ({ data: null, error: null }),
    upsert: async () => ({ data: null, error: null }),
    delete: async () => ({ data: null, error: null }),
  })
};