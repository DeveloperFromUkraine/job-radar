import { useMutation } from "@tanstack/react-query";
import { setRealnessOn } from "../../api/realness";

/** Save first, then the list reloads (sad.md §6 flow 2); a failure leaves everything as it was (AC-11). */
export function useSetRealnessOn(onSaved: () => void) {
  return useMutation({ mutationFn: setRealnessOn, onSuccess: onSaved });
}
