fn main() {
    // Arayüz dosyaları bu crate'in dışında (../ui). Cargo, paket dışındaki
    // dosyaları izlemediği için HTML/CSS/JS değişince build script yeniden
    // çalışmıyor ve exe ESKİ arayüzü gömülü tutuyordu. Aşağıdaki satırlar
    // olmadan `cargo build` eski UI ile "Finished" diyebiliyor.
    println!("cargo:rerun-if-changed=../ui");
    println!("cargo:rerun-if-changed=../ui/index.html");
    println!("cargo:rerun-if-changed=../ui/css");
    println!("cargo:rerun-if-changed=../ui/js");
    tauri_build::build()
}
