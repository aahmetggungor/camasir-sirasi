import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

// Vektör benzeri native şekiller; resim/font yüklenmeden de makine simgesi görünür.
export function MachineVisual({ available = false }: { available?: boolean }) {
  const color = available ? colors.blue : "#8591a8";
  return (
    <View style={[s.machine, { borderColor: color }]}>
      <View style={s.top}>
        <View style={[s.slot, { backgroundColor: color }]} />
        <View style={[s.dot, { backgroundColor: color }]} />
      </View>
      <View style={[s.drum, { borderColor: color }]}>
        <View style={[s.water, { backgroundColor: color }]} />
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  machine: {
    width: 46,
    height: 53,
    borderWidth: 2,
    borderRadius: 8,
    padding: 6,
    gap: 6,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slot: { width: 13, height: 3, borderRadius: 2 },
  dot: { width: 4, height: 4, borderRadius: 3 },
  drum: {
    height: 26,
    width: 26,
    borderWidth: 2,
    borderRadius: 15,
    alignSelf: "center",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  water: { height: 11, opacity: 0.17 },
});
