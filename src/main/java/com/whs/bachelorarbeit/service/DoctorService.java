package com.whs.bachelorarbeit.service;

import com.whs.bachelorarbeit.dto.DoctorListItemDTO;
import com.whs.bachelorarbeit.repository.DoctorRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class DoctorService {

    private final DoctorRepository doctorRepository;

    public DoctorService(DoctorRepository doctorRepository) {
        this.doctorRepository = doctorRepository;
    }


    public List<DoctorListItemDTO> getAll() {
        return doctorRepository.findAllListItems();
    }


    public DoctorListItemDTO getById(long id) {
        return doctorRepository.findListItemById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Doktor nicht gefunden: " + id
        ));

    }





}
