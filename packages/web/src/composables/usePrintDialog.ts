import { ref } from 'vue';

export const printDialogOpen = ref(false);
export const printingAll = ref(false);

export function openPrintDialog() {
  printDialogOpen.value = true;
}

export function closePrintDialog() {
  printDialogOpen.value = false;
}
