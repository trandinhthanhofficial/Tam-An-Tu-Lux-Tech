/* =============================================================================
   config.js — the only file you normally need to edit.

   A "server" is just a room id. Everyone who picks the same server lands in the
   same hall; different servers are completely separate rooms on the broker.
   Add, rename or remove entries freely — the picker builds itself from this list.
   ========================================================================== */
window.APP_CONFIG = {
  servers: [
    { id: 'luxshare',   name: 'Luxshare-TECH',      nameZh: 'Luxshare-TECH' },
    { id: 'chungdien',  name: 'Chánh Điện Chung',   nameZh: '公共正殿' },
    { id: 'thienvien',  name: 'Thiền Viện Tịnh Tâm', nameZh: '静心禅院' },
  ],

  // Which server is preselected on the entry screen.
  defaultServer: 'luxshare',

  // Seats in the hall. Keep this equal to the number of seats built in hall.js.
  capacity: 32,
};
