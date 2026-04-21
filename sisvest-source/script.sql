
    create table bancoq.Alternativa (
        id_alternativa int8 not null,
        qtdMarcComoCorreta int8,
        texto varchar(1000),
        verdadeira boolean not null,
        id_objetiva int8 not null,
        primary key (id_alternativa)
    )

    create table bancoq.Aluno (
        enem boolean not null,
        tempoEstudo timestamp,
        id_pessoa int8 not null,
        lingEstrangeira_id_disciplina int8,
        primary key (id_pessoa)
    )

    create table bancoq.Area (
        id_area int8 not null,
        nome varchar(255) not null,
        id_disciplina int8 not null,
        primary key (id_area)
    )

    create table bancoq.Assunto (
        id_assunto int8 not null,
        nome varchar(255) not null,
        id_area int8 not null,
        primary key (id_assunto)
    )

    create table bancoq.Cidade (
        id_cidade int8 not null,
        nome varchar(40) not null,
        id_estado int8 not null,
        primary key (id_cidade)
    )

    create table bancoq.Concurso (
        id_concurso int8 not null,
        nome varchar(30) not null,
        id_instituicaoConcedente int8 not null,
        id_instituicaoRealizadora int8 not null,
        primary key (id_concurso)
    )

    create table bancoq.DiaDeProva (
        id_diadeprova int8 not null,
        data date not null,
        nome varchar(64) not null,
        tempoResolucao timestamp not null,
        id_concurso int8 not null,
        primary key (id_diadeprova)
    )

    create table bancoq.Disciplina (
        id_disciplina int8 not null,
        linguaEstrangeira boolean not null,
        nome varchar(64) not null,
        primary key (id_disciplina)
    )

    create table bancoq.Discursiva (
        numLinhas int4,
        id_questao int8 not null,
        primary key (id_questao)
    )

    create table bancoq.Estado (
        id_estado int8 not null,
        nome varchar(30) not null,
        uF varchar(2) not null,
        primary key (id_estado)
    )

    create table bancoq.Imagem (
        id_imagem int8 not null,
        imagem bytea not null,
        linhaPosicaoImg int4 not null,
        tamanhoExibicao int4 not null,
        primary key (id_imagem)
    )

    create table bancoq.ImagemAlternativa (
        id_imagem int8 not null,
        id_alternativa int8 not null,
        primary key (id_imagem)
    )

    create table bancoq.ImagemQuestao (
        id_imagem int8 not null,
        id_quetao int8 not null,
        primary key (id_imagem)
    )

    create table bancoq.ImagemTexto (
        id_imagem int8 not null,
        id_textocentral int8 not null,
        primary key (id_imagem)
    )

    create table bancoq.Instituicao (
        id_instituicao int8 not null,
        nome varchar(100) not null,
        id_tipoinstituicao int8,
        primary key (id_instituicao)
    )

    create table bancoq.InstituicaoConcedente (
        id_instituicao int8 not null,
        primary key (id_instituicao)
    )

    create table bancoq.InstituicaoRealizadora (
        abreviacao varchar(8) not null,
        id_instituicao int8 not null,
        primary key (id_instituicao)
    )

    create table bancoq.MultiplaEscolha (
        id_questao int8 not null,
        primary key (id_questao)
    )

    create table bancoq.NivelEscolaridade (
        id_nivelescolaridade int8 not null,
        nome varchar(25) not null,
        primary key (id_nivelescolaridade)
    )

    create table bancoq.Objetiva (
        avgAcerto float4,
        id_questao int8 not null,
        primary key (id_questao)
    )

    create table bancoq.Pessoa (
        id_pessoa int8 not null,
        cep varchar(8),
        cpf varchar(11) not null,
        dtCadastro date,
        dtNasc date,
        email varchar(60) not null,
        nome varchar(70) not null,
        sexo char(1) not null,
        primary key (id_pessoa)
    )

    create table bancoq.Prova (
        id_prova int8 not null,
        numQuestoes int4 not null,
        valor int4 not null,
        id_diadeprova int8,
        id_disciplina int8,
        primary key (id_prova)
    )

    create table bancoq.Questao (
        id_questao int8 not null,
        avgTempResol timestamp,
        dificuldade int4 not null,
        resolucao varchar(255),
        texto varchar(3000) not null,
        id_prova int8 not null,
        id_textocentral int8,
        primary key (id_questao)
    )

    create table bancoq.Resposta (
        id_resposta int8 not null,
        nivelCerteza int4 not null,
        tempResolucao timestamp not null,
        id_aluno int8 not null,
        id_questao int8 not null,
        primary key (id_resposta)
    )

    create table bancoq.RespostaDiscursiva (
        textoResposta varchar(2000) not null,
        id_resposta int8 not null,
        primary key (id_resposta)
    )

    create table bancoq.RespostaObjetiva (
        id_resposta int8 not null,
        primary key (id_resposta)
    )

    create table bancoq.Role (
        id_role int8 not null,
        nome varchar(64),
        primary key (id_role)
    )

    create table bancoq.TextoCentral (
        id_textocentral int8 not null,
        texto varchar(5500) not null,
        primary key (id_textocentral)
    )

    create table bancoq.TipoInstituicao (
        id_tipoinstituicao int8 not null,
        nome varchar(35) not null,
        primary key (id_tipoinstituicao)
    )

    create table bancoq.UnicaEscolha (
        id_questao int8 not null,
        primary key (id_questao)
    )

    create table bancoq.Usuario (
        id_usuario int8 not null,
        login varchar(50) not null,
        senha varchar(50) not null,
        id_pessoa int8,
        primary key (id_usuario)
    )

    create table bancoq.Vaga (
        id_vaga int8 not null,
        nome varchar(100) not null,
        id_concurso int8 not null,
        id_nivelescolaridade int8 not null,
        primary key (id_vaga)
    )

    create table bancoq.alternetiva_respostaobjetiva (
        id_alternativa int8 not null,
        id_resposta int8 not null
    )

    create table bancoq.assunto_prerequisito (
        id_assunto int8 not null,
        id_prerequisito int8 not null
    )

    create table bancoq.assunto_questao (
        id_assunto int8 not null,
        id_questao int8 not null
    )

    create table bancoq.intituicaoconcedente_cidade (
        id_instituicaoconcedente int8 not null,
        id_cidade int8 not null
    )

    create table bancoq.usuario_role (
        id_usuario int8 not null,
        id_role int8 not null
    )

    alter table bancoq.Alternativa 
        add constraint FK_nl3e6x4c6ty7shldq70o6c9l0 
        foreign key (id_objetiva) 
        references bancoq.Objetiva

    alter table bancoq.Aluno 
        add constraint FK_hgcbma47ahhfpg226383li9k8 
        foreign key (lingEstrangeira_id_disciplina) 
        references bancoq.Disciplina

    alter table bancoq.Aluno 
        add constraint FK_hi7o5pdntgfmfk224i5t3shpk 
        foreign key (id_pessoa) 
        references bancoq.Pessoa

    alter table bancoq.Area 
        add constraint FK_92f2lmta5sv4hde1ch8a05weg 
        foreign key (id_disciplina) 
        references bancoq.Disciplina

    alter table bancoq.Assunto 
        add constraint FK_635uyjgoi9ekwsqmayfr80dx0 
        foreign key (id_area) 
        references bancoq.Area

    alter table bancoq.Cidade 
        add constraint FK_8k6q9nbldi41knjit6qcnbcqs 
        foreign key (id_estado) 
        references bancoq.Estado

    alter table bancoq.Concurso 
        add constraint FK_l2sn6mbvej1w6f98chimx190j 
        foreign key (id_instituicaoConcedente) 
        references bancoq.InstituicaoConcedente

    alter table bancoq.Concurso 
        add constraint FK_7lfp2gr6kmqhg50nd9vurwjsd 
        foreign key (id_instituicaoRealizadora) 
        references bancoq.InstituicaoRealizadora

    alter table bancoq.DiaDeProva 
        add constraint FK_g5slkk9b37o9kaamgebt7r4ux 
        foreign key (id_concurso) 
        references bancoq.Concurso

    alter table bancoq.Discursiva 
        add constraint FK_40y6gam15e2nm6kqsovqvshar 
        foreign key (id_questao) 
        references bancoq.Questao

    alter table bancoq.ImagemAlternativa 
        add constraint FK_nsrf6h75gc20lkw2vib45gh2s 
        foreign key (id_alternativa) 
        references bancoq.Alternativa

    alter table bancoq.ImagemAlternativa 
        add constraint FK_p2vgrubid20cfk4bc109w57is 
        foreign key (id_imagem) 
        references bancoq.Imagem

    alter table bancoq.ImagemQuestao 
        add constraint FK_geme85jha8ypax5ul5csrixs6 
        foreign key (id_quetao) 
        references bancoq.Questao

    alter table bancoq.ImagemQuestao 
        add constraint FK_38ygf99y6fkoo5dd44cs8l7io 
        foreign key (id_imagem) 
        references bancoq.Imagem

    alter table bancoq.ImagemTexto 
        add constraint FK_h3mu678cx4cfrbpye11p6te17 
        foreign key (id_textocentral) 
        references bancoq.TextoCentral

    alter table bancoq.ImagemTexto 
        add constraint FK_h2e2627blxckltrp30c5qy7h2 
        foreign key (id_imagem) 
        references bancoq.Imagem

    alter table bancoq.Instituicao 
        add constraint FK_sp7t74p9yk7a98dij9q4m71m4 
        foreign key (id_tipoinstituicao) 
        references bancoq.TipoInstituicao

    alter table bancoq.InstituicaoConcedente 
        add constraint FK_o49duhehhexi8070xji9okhsh 
        foreign key (id_instituicao) 
        references bancoq.Instituicao

    alter table bancoq.InstituicaoRealizadora 
        add constraint FK_t2wegqeybrmdgulxuew8idd19 
        foreign key (id_instituicao) 
        references bancoq.Instituicao

    alter table bancoq.MultiplaEscolha 
        add constraint FK_dm69cetkltfw7m4ytt6imda9g 
        foreign key (id_questao) 
        references bancoq.Objetiva

    alter table bancoq.Objetiva 
        add constraint FK_f4b8nbckai55qoe3f6gbf6w34 
        foreign key (id_questao) 
        references bancoq.Questao

    alter table bancoq.Prova 
        add constraint FK_rkct9uf033h83flk4qqkygxml 
        foreign key (id_diadeprova) 
        references bancoq.DiaDeProva

    alter table bancoq.Prova 
        add constraint FK_kbxtml7s245uhwmocr465elm4 
        foreign key (id_disciplina) 
        references bancoq.Disciplina

    alter table bancoq.Questao 
        add constraint FK_jyo506nviatt8jnexnm94pd0j 
        foreign key (id_prova) 
        references bancoq.Prova

    alter table bancoq.Questao 
        add constraint FK_97v9q0scalsmyeidfo7civpf 
        foreign key (id_textocentral) 
        references bancoq.TextoCentral

    alter table bancoq.Resposta 
        add constraint FK_i3qt2rap67q8j75txl5w9l6ep 
        foreign key (id_aluno) 
        references bancoq.Aluno

    alter table bancoq.Resposta 
        add constraint FK_s7xmvn733mtlg7o56fs2ag8uv 
        foreign key (id_questao) 
        references bancoq.Questao

    alter table bancoq.RespostaDiscursiva 
        add constraint FK_999of05rf8doker0ivge9sbon 
        foreign key (id_resposta) 
        references bancoq.Resposta

    alter table bancoq.RespostaObjetiva 
        add constraint FK_qf3qqamvt145c8l2qk4lntxi5 
        foreign key (id_resposta) 
        references bancoq.Resposta

    alter table bancoq.UnicaEscolha 
        add constraint FK_tjxjfdu6x1e9yrntdaaia0eh1 
        foreign key (id_questao) 
        references bancoq.Objetiva

    alter table bancoq.Usuario 
        add constraint FK_qxu4oqcfwibvtudkocbtqgkua 
        foreign key (id_pessoa) 
        references bancoq.Pessoa

    alter table bancoq.Vaga 
        add constraint FK_laan2rnfm69lq9iloairbqys2 
        foreign key (id_concurso) 
        references bancoq.Concurso

    alter table bancoq.Vaga 
        add constraint FK_a9wooogblxtn7mxc6f5jifp4j 
        foreign key (id_nivelescolaridade) 
        references bancoq.NivelEscolaridade

    alter table bancoq.alternetiva_respostaobjetiva 
        add constraint FK_7o3mcyvakldcrdtv0p8c53ash 
        foreign key (id_resposta) 
        references bancoq.RespostaObjetiva

    alter table bancoq.alternetiva_respostaobjetiva 
        add constraint FK_appli3idyrc4jobua1phu14yg 
        foreign key (id_alternativa) 
        references bancoq.Alternativa

    alter table bancoq.assunto_prerequisito 
        add constraint FK_t3mei1mr3xy9vdcoco5u9kkyq 
        foreign key (id_prerequisito) 
        references bancoq.Assunto

    alter table bancoq.assunto_prerequisito 
        add constraint FK_3ustqsugvlox910s5jaj5r9j 
        foreign key (id_assunto) 
        references bancoq.Assunto

    alter table bancoq.assunto_questao 
        add constraint FK_83y7lv1xmqobqxirxfj9yo6n8 
        foreign key (id_questao) 
        references bancoq.Questao

    alter table bancoq.assunto_questao 
        add constraint FK_m2c0h023uboichqxxv0elri3s 
        foreign key (id_assunto) 
        references bancoq.Assunto

    alter table bancoq.intituicaoconcedente_cidade 
        add constraint FK_fs8uha7iy16w3mrecf86dlukg 
        foreign key (id_cidade) 
        references bancoq.Cidade

    alter table bancoq.intituicaoconcedente_cidade 
        add constraint FK_760rlb2ix93w1s3fh2oi2norv 
        foreign key (id_instituicaoconcedente) 
        references bancoq.InstituicaoConcedente

    alter table bancoq.usuario_role 
        add constraint FK_t2810c7g4l83wght217kwpux9 
        foreign key (id_role) 
        references bancoq.Role

    alter table bancoq.usuario_role 
        add constraint FK_rjjwsv1npynmiou408xtu912m 
        foreign key (id_usuario) 
        references bancoq.Usuario

    create sequence hibernate_sequence
