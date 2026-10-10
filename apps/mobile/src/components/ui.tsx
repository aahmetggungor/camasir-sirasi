import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export function Icon({
  name,
  size = 22,
  color = colors.blue,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function Card({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return <View style={[s.card, accent && s.accentCard]}>{children}</View>;
}
export function Heading({
  children,
  small = false,
}: {
  children: ReactNode;
  small?: boolean;
}) {
  return <Text style={small ? s.headingSmall : s.heading}>{children}</Text>;
}
export function Body({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return <Text style={[s.body, muted && s.muted]}>{children}</Text>;
}
export function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}
export function Badge({
  text,
  tone = "blue",
}: {
  text: string;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const fg = {
    blue: colors.blue,
    green: colors.green,
    amber: colors.amber,
    red: colors.red,
  }[tone];
  const bg = {
    blue: colors.blueSoft,
    green: colors.greenSoft,
    amber: colors.amberSoft,
    red: colors.redSoft,
  }[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}
export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  secondary = false,
  danger = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  icon?: IconName;
}) {
  const textColor = secondary
    ? danger
      ? colors.red
      : colors.ink
    : colors.white;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        danger && !secondary && s.danger,
        (disabled || busy) && s.disabled,
        pressed && s.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : icon ? (
        <Icon name={icon} size={20} color={textColor} />
      ) : null}
      <Text style={[s.buttonText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={s.field}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8893a5"
        {...props}
        style={[s.input, props.style]}
      />
    </View>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <View accessibilityRole="alert" style={[s.notice, error && s.errorNotice]}>
      <Icon
        name={error ? "alert-circle-outline" : "information-circle-outline"}
        color={error ? colors.red : colors.blue}
      />
      <Text style={[s.noticeText, error && { color: colors.red }]}>
        {children}
      </Text>
    </View>
  );
}
export function Empty({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text: string;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon name={icon} size={30} />
      </View>
      <Heading small>{title}</Heading>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}
export function Row({ children }: { children: ReactNode }) {
  return <View style={s.row}>{children}</View>;
}
export function Chips<T extends string>({
  values,
  selected,
  onSelect,
}: {
  values: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={s.chips}>
      {values.map((item) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: item.value === selected }}
          key={item.value}
          onPress={() => onSelect(item.value)}
          style={[s.chip, item.value === selected && s.chipSelected]}
        >
          <Text
            style={[s.chipText, item.value === selected && s.chipTextSelected]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Sheet({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          accessibilityLabel="Pencereyi kapat"
          onPress={onClose}
          style={s.backdrop}
        />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Heading small>{title}</Heading>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kapat"
              onPress={onClose}
              style={s.close}
            >
              <Icon name="close" color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.sheetContent}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function Confirm({
  label,
  title,
  message,
  onConfirm,
  busy = false,
  danger = false,
}: {
  label: string;
  title: string;
  message: string;
  onConfirm: () => Promise<boolean | void>;
  busy?: boolean;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        label={label}
        secondary
        danger={danger}
        busy={busy}
        onPress={() => setOpen(true)}
      />
      <Sheet
        title={title}
        visible={open}
        onClose={() => !busy && setOpen(false)}
      >
        <Body>{message}</Body>
        <Button
          label="Evet, onaylıyorum"
          busy={busy}
          danger={danger}
          onPress={() =>
            void onConfirm().then((result) => {
              if (result !== false) setOpen(false);
            })
          }
        />
        <Button
          label="Vazgeç"
          secondary
          disabled={busy}
          onPress={() => setOpen(false)}
        />
      </Sheet>
    </>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accentCard: { backgroundColor: colors.blueSoft, borderColor: "#d6e1ff" },
  heading: {
    fontSize: 28,
    lineHeight: 35,
    fontWeight: "700",
    letterSpacing: -0.7,
    color: colors.ink,
  },
  headingSmall: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: colors.ink,
    flexShrink: 1,
  },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink },
  muted: { color: colors.muted },
  label: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: colors.muted,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  badgeText: { fontSize: 12, fontWeight: "600", lineHeight: 16 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.blue,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    flexShrink: 1,
    textAlign: "center",
  },
  secondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: { backgroundColor: colors.red },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.78 },
  field: { gap: 7 },
  input: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 12,
    fontSize: 16,
    color: colors.ink,
  },
  notice: {
    padding: 14,
    backgroundColor: colors.blueSoft,
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  errorNotice: { backgroundColor: colors.redSoft },
  noticeText: { color: colors.blue, fontSize: 14, lineHeight: 21, flex: 1 },
  empty: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyIcon: {
    backgroundColor: colors.blueSoft,
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    color: colors.muted,
    maxWidth: 300,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
  },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  chipText: { fontSize: 14, color: colors.muted, fontWeight: "500" },
  chipTextSelected: { color: colors.blue },
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(19,31,55,0.35)",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    paddingTop: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#c9d1df",
    alignSelf: "center",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 22,
    paddingRight: 12,
    paddingTop: 8,
  },
  close: {
    height: 44,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetContent: { gap: 16, padding: 22, paddingBottom: 40 },
});
