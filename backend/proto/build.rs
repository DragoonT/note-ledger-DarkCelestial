fn main() {
    println!("cargo:rerun-if-changed=out/_.rs");
    assert!(
        std::path::Path::new("out/_.rs").exists(),
        "run the external proto generator first"
    );
}
