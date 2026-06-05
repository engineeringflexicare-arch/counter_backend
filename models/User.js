import { collection } from "firebase/firestore";
import { firestore } from "../database.js";

const UsersCollection = collection(firestore, "users");

export default UsersCollection;
