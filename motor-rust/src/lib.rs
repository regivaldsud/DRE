const PESO_AGUA: f64 = 9.81;

struct Pressao {
    nivel: f64,
    peso_seco: f64,
    peso_submerso: f64,
    k: f64,
    sobrecarga: f64,
}

impl Pressao {
    fn new(nivel: f64, seco: f64, saturado: f64, k: f64, sobrecarga: f64) -> Self {
        Self {
            nivel,
            peso_seco: seco,
            peso_submerso: (saturado - PESO_AGUA).max(0.0),
            k,
            sobrecarga,
        }
    }

    fn componentes(&self, z: f64) -> (f64, f64) {
        let submerso = (z - self.nivel).max(0.0);
        let solo = self.k
            * (self.sobrecarga
                + self.peso_seco * z.min(self.nivel)
                + self.peso_submerso * submerso);
        (solo, PESO_AGUA * submerso)
    }

    fn total(&self, z: f64) -> f64 {
        let (solo, agua) = self.componentes(z);
        solo + agua
    }

    fn esforcos(&self, z: f64) -> (f64, f64) {
        let quebra = self.nivel.min(z);
        let mut cortante = 0.0;
        let mut momento = 0.0;
        for (a, b) in [(0.0, quebra), (quebra, z)] {
            if b <= a {
                continue;
            }
            let dz = b - a;
            let p = self.total(a);
            let constante = p * dz;
            let triangular = (self.total(b) - p) * dz / 2.0;
            cortante += constante + triangular;
            momento += constante * (z - a - dz / 2.0) + triangular * (z - a - 2.0 * dz / 3.0);
        }
        (cortante, momento)
    }

    fn maximos(&self, altura: f64, biapoiada: bool) -> (f64, f64) {
        let (total, momento_base) = self.esforcos(altura);
        if !biapoiada {
            return (total, momento_base);
        }
        let reacao_topo = momento_base / altura;
        let cortante_max = reacao_topo.max(total - reacao_topo);
        let (mut a, mut b) = (0.0, altura);
        for _ in 0..45 {
            let z = (a + b) / 2.0;
            if self.esforcos(z).0 < reacao_topo {
                a = z;
            } else {
                b = z;
            }
        }
        let z = (a + b) / 2.0;
        (
            cortante_max,
            (reacao_topo * z - self.esforcos(z).1).max(0.0),
        )
    }
}

#[no_mangle]
pub extern "C" fn dre_pressao_solo(
    z: f64,
    nivel: f64,
    seco: f64,
    saturado: f64,
    k: f64,
    sobrecarga: f64,
) -> f64 {
    Pressao::new(nivel, seco, saturado, k, sobrecarga)
        .componentes(z)
        .0
}

#[no_mangle]
pub extern "C" fn dre_pressao_agua(z: f64, nivel: f64) -> f64 {
    PESO_AGUA * (z - nivel).max(0.0)
}

#[no_mangle]
pub extern "C" fn dre_esforco(
    z: f64,
    nivel: f64,
    seco: f64,
    saturado: f64,
    k: f64,
    sobrecarga: f64,
    momento: u32,
) -> f64 {
    let (v, m) = Pressao::new(nivel, seco, saturado, k, sobrecarga).esforcos(z);
    if momento == 0 {
        v
    } else {
        m
    }
}

#[no_mangle]
pub extern "C" fn dre_maximo(
    altura: f64,
    nivel: f64,
    seco: f64,
    saturado: f64,
    k: f64,
    sobrecarga: f64,
    biapoiada: u32,
    momento: u32,
) -> f64 {
    let (v, m) = Pressao::new(nivel, seco, saturado, k, sobrecarga).maximos(altura, biapoiada != 0);
    if momento == 0 {
        v
    } else {
        m
    }
}

#[no_mangle]
pub extern "C" fn dre_area_infiltracao(c: f64, l: f64, h: f64, fundo: u32) -> f64 {
    let base = if fundo == 0 { 0.0 } else { c * l };
    base + 2.0 * l * h + 2.0 * c * h
}

#[no_mangle]
pub extern "C" fn dre_queda(distancia: f64, declividade: f64) -> f64 {
    distancia * declividade / 100.0
}

#[no_mangle]
pub extern "C" fn dre_termo_fossa(n: f64, c: f64, t: f64, k: f64, lf: f64) -> f64 {
    n * (c * t + k * lf)
}

#[no_mangle]
pub extern "C" fn dre_termo_filtro(n: f64, c: f64, t: f64) -> f64 {
    n * c * t
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integra_pressao_com_quebra_no_lencol() {
        let carga = Pressao::new(1.0, 18.0, 20.0, 0.0, 0.0);
        let (v, m) = carga.esforcos(2.0);
        assert!((v - 4.905).abs() < 1e-10);
        assert!((m / v - 1.0 / 3.0).abs() < 1e-10);
    }

    #[test]
    fn reproduz_termos_hidraulicos() {
        assert_eq!(dre_termo_fossa(32.0, 100.0, 0.83, 65.0, 1.0), 4736.0);
        assert_eq!(dre_termo_filtro(32.0, 100.0, 1.0), 3200.0);
        assert_eq!(dre_area_infiltracao(4.0, 2.0, 2.0, 1), 32.0);
        assert_eq!(dre_area_infiltracao(4.0, 2.0, 2.0, 0), 24.0);
    }
}
