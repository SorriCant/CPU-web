<template>
  <JwxtSubViews :views="views" label="教室" id-prefix="jwxt-rooms" :active="active">
    <template #free="{ active: shown }"><FreeRoomsPane :active="shown" /></template>
    <template #search="{ active: shown }"><TimetableSearchPane :active="shown" /></template>
  </JwxtSubViews>
</template>

<script setup lang="ts">
import JwxtSubViews from "@/components/jwxt/JwxtSubViews.vue";
import FreeRoomsPane from "@/components/jwxt/records/FreeRoomsPane.vue";
import TimetableSearchPane from "@/components/jwxt/records/TimetableSearchPane.vue";

defineProps<{ active?: boolean }>();

const views = [
  { key: "free", label: "空教室" },
  { key: "search", label: "课表检索" },
];
</script>
