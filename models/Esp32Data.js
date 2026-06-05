import { ref } from "firebase/database";
import { rtdb } from "../database.js";

export const linesRef = ref(rtdb, "Lines");
