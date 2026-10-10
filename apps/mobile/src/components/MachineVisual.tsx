import { StyleSheet, View } from "react-native";
import { colors } from "../theme";
import type { MachineType } from "@camasir/core";

// Vektör benzeri native şekiller; resim/font yüklenmeden de makine simgesi görünür.
export function MachineVisual({
  available = false,
  type = "washer",
}: {
  available?: boolean;
  type?: MachineType;
}) {
  const color = available
    ? type === "dryer"
      ? "#a66e22"
      : colors.blue
    : "#8591a8";
  return (
    <View style={[s.machine, { borderColor: color }]}>
      <View style={s.top}>
        <View style={[s.slot, { backgroundColor: color }]} />
        <View style={[s.dot, { backgroundColor: color }]} />
      </View>
      <View style={[s.drum, { borderColor: color }]}>
        {type === "dryer" ? (
          <View style={{ gap: 3, alignItems: "center", paddingBottom: 6 }}>
            {[1, 2, 3].map((n) => (
              <View
                key={n}
                style={{
                  width: 14,
                  height: 2,
                  borderRadius: 2,
                  backgroundColor: color,
                  opacity: 0.7,
                }}
              />
            ))}
          </View>
        ) : (
          <View style={[s.water, { backgroundColor: color }]} />
        )}
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
